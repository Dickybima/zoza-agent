"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowRightIcon, CornerDownLeftIcon } from "lucide-react";

import {
  CANCEL,
  CONFIRM,
  CREATOR_FEE,
  NETWORK,
  PROTOCOL_FEE,
  SUPPLY,
  TAX,
  fmt,
  nextMissing,
  parseAnswer,
  parsePrompt,
  randHex,
  shortAddr,
} from "@/lib/agent";
import type { Draft, Field } from "@/lib/agent";
import { useTokens } from "@/lib/tokens";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/logo";
import { Section, SectionHeading } from "@/components/site/section";

type Message = { id: number; role: "bot" | "user"; content: ReactNode; typing?: boolean };
type Blueprint = { tok: Draft & { address?: string }; status: string; live?: boolean };

const QUESTIONS: Record<Field, ReactNode> = {
  name: <>What would you like to <b>name</b> your token?</>,
  ticker: <>Choose a <b>ticker</b> (2–10 characters), e.g. <Code>LBTY</Code>.</>,
  x: <>Link your project’s <b>X</b> account — <Code>@handle</Code> or <Code>x.com/handle</Code>. Type <Code>skip</Code> if you don’t have one yet.</>,
  website: <>Finally, what’s the <b>website</b>? Type <Code>skip</Code> if you don’t have one yet.</>,
};

const EXAMPLES = [
  "Token Moon Cat ticker MEOW x @mooncat web mooncat.xyz",
  "Token ZetaCoin ticker ZETA x x.com/zetacoin website zetacoin.io",
  "Token Liberty",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Code({ children }: { children: ReactNode }) {
  return <code className="break-all border border-border bg-background px-1 py-px text-[0.92em] text-signal">{children}</code>;
}

export function AgentConsole() {
  const { address, connect } = useWallet();
  const { publish } = useTokens();
  const [messages, setMessages] = useState<Message[]>([]);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const draftRef = useRef<Draft | null>(null);
  const askingRef = useRef<Field | null>(null);
  const readyRef = useRef(false);
  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  const push = useCallback((m: Omit<Message, "id">) => {
    const id = ++idRef.current;
    setMessages((prev) => [...prev, { ...m, id }]);
    return id;
  }, []);

  const botSay = useCallback(
    async (content: ReactNode, delay = 700) => {
      const id = push({ role: "bot", content: null, typing: true });
      await sleep(delay);
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, typing: false } : m)));
    },
    [push],
  );

  // keep the log pinned to the newest line without scrolling the page
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    push({
      role: "bot",
      content: (
        <>
          Welcome. I’m <b>Zoza</b> — the agent that turns your ideas into tokens on <b>{NETWORK}</b>. Just share a{" "}
          <b>name</b>, <b>ticker</b>, <b>X</b> account, and <b>website</b>. Of the {TAX}% tax on every trade, {CREATOR_FEE}% flows
          straight to your wallet.
        </>
      ),
    });
  }, [push]);

  const render = (tok: Draft, status: string) => setBlueprint({ tok: { ...tok }, status });

  // `handle` is referenced from buttons inside earlier messages, so route it
  // through a ref to always reach the latest closure
  const handleRef = useRef<(text: string) => void>(() => {});

  const askNext = async () => {
    const draft = draftRef.current!;
    const f = nextMissing(draft);
    if (f) {
      askingRef.current = f;
      render(draft, "gathering details");
      return botSay(QUESTIONS[f]);
    }
    askingRef.current = null;
    readyRef.current = true;
    render(draft, "awaiting confirmation");
    const wallet = addressRef.current;
    await botSay(
      <>
        Your token blueprint is ready:
        <ul className="my-2 space-y-0.5">
          <li>• Name: <b>{draft.name}</b></li>
          <li>• Ticker: <b>${draft.ticker}</b></li>
          <li>• X: <b>{draft.x ? "@" + draft.x : "—"}</b></li>
          <li>• Website: <b>{draft.website || "—"}</b></li>
          <li>
            • Tax: <b>{TAX}%</b> on every buy & sell — <b>{CREATOR_FEE}%</b> flows to{" "}
            {wallet ? <Code>{shortAddr(wallet)}</Code> : "the wallet you launch from"}, <b>{PROTOCOL_FEE}%</b> as a protocol fee
          </li>
        </ul>
        Launch now? You can still refine any detail, e.g. <Code>ticker ABC</Code>.
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="signal" onClick={() => handleRef.current("Launch")}>
            Launch <ArrowRightIcon />
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleRef.current("Cancel")}>
            Cancel
          </Button>
        </div>
      </>,
      900,
    );
  };

  const deploy = async () => {
    const tok = draftRef.current!;
    draftRef.current = null;
    readyRef.current = false;
    let wallet = addressRef.current;
    if (!wallet) {
      await botSay("Choose a wallet to continue…", 400);
      wallet = await connect();
      if (!wallet) return botSay("Wallet not connected. Please try again.");
    }
    const startedAt = performance.now();
    const steps = [
      "Composing your smart contract from audited architecture…",
      `Routing the ${CREATOR_FEE}% creator fee to ${shortAddr(wallet)} and ${PROTOCOL_FEE}% to the protocol…`,
      "Embedding your X and website links in token metadata…",
      "Awaiting your transaction signature…",
      `Broadcasting to ${NETWORK}…`,
    ];
    for (const [i, s] of steps.entries()) {
      render(tok, s.toLowerCase().replace(/…$/, ""));
      await botSay(
        <span className="text-muted-foreground">
          [{i + 1}/{steps.length}] {s}
        </span>,
        650,
      );
    }
    const addr = "0x" + randHex(40);
    const tx = "0x" + randHex(64);
    const launchSeconds = Math.round((performance.now() - startedAt) / 100) / 10;
    setBlueprint({ tok: { ...tok, address: addr }, status: `LIVE on ${NETWORK} (demo)`, live: true });
    publish({
      name: tok.name!,
      ticker: tok.ticker!,
      x: tok.x ?? null,
      website: tok.website ?? null,
      address: addr,
      creator: wallet,
      tx,
      createdAt: Date.now(),
      launchSeconds,
    });
    await botSay(
      <>
        <span className="text-signal">✓</span> <b>{tok.name}</b> (${tok.ticker}) is officially live!
        <br />
        Contract: <Code>{addr}</Code>
        <br />
        Tx: <Code>{tx.slice(0, 18)}…</Code>
        <br />
        Of the {TAX}% tax on every trade, {CREATOR_FEE}% now flows to <Code>{shortAddr(wallet)}</Code> and {PROTOCOL_FEE}% goes to
        the protocol.
        <div className="mt-3">
          <Button size="sm" variant="outline" asChild>
            <a href="#explore">
              View in Explore <ArrowRightIcon />
            </a>
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">*This is a simulation — the address and hash above are not real transactions.</p>
      </>,
      900,
    );
  };

  const handle = async (text: string) => {
    push({ role: "user", content: text });
    const lower = text.trim().toLowerCase();

    if (draftRef.current && CANCEL.test(lower)) {
      draftRef.current = null;
      askingRef.current = null;
      readyRef.current = false;
      return botSay("Understood — draft discarded. Tell me about the next token you’d like to create.");
    }
    if (CONFIRM.test(lower)) {
      if (readyRef.current) return deploy();
      if (askingRef.current) return botSay(<>Almost there — a few details are still missing. {QUESTIONS[askingRef.current]}</>);
    }

    const p = parsePrompt(text);
    const found = Object.keys(p).length > 0;
    const draft = draftRef.current;

    if (!draft) {
      if (!found) {
        const a = parseAnswer("name", text);
        if (!a.name) return botSay(QUESTIONS.name);
        draftRef.current = a;
      } else draftRef.current = p;
    } else if (p.name && readyRef.current && /\btoken\b/i.test(text)) {
      draftRef.current = p; // "token ..." after the summary starts a new token; "name ..." renames
    } else if (found) {
      Object.assign(draft, p);
    } else if (askingRef.current) {
      const a = parseAnswer(askingRef.current, text);
      if (!Object.keys(a).length) return botSay(<>That format doesn’t look quite right. {QUESTIONS[askingRef.current]}</>);
      Object.assign(draft, a);
    } else {
      return botSay(
        <>
          To refine a detail, try <Code>name Liberty</Code>, <Code>ticker LBTY</Code>, <Code>x @liberty</Code>, or{" "}
          <Code>web liberty.io</Code>. Type <Code>launch</Code> when you’re ready.
        </>,
      );
    }

    readyRef.current = false;
    return askNext();
  };
  useEffect(() => {
    handleRef.current = handle;
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setInput("");
    handle(v);
  };

  return (
    <Section id="agent">
      <SectionHeading index="03" label="The lab" title="Converse with Zoza.">
        Demo mode — every launch here is a simulation. No real transactions are sent.
      </SectionHeading>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        {/* terminal */}
        <div className="flex h-[600px] min-w-0 flex-col border border-border bg-card/50">
          <WindowBar title="zoza@robinhood-chain: ~/launch" />
          <div ref={logRef} className="flex-1 space-y-4 overflow-y-auto p-4 text-sm leading-relaxed sm:p-5">
            {messages.map((m) => (
              <div key={m.id} className="flex gap-3 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                <span className={cn("shrink-0 select-none", m.role === "user" ? "text-signal" : "text-muted-foreground")}>
                  {m.role === "user" ? "you ›" : "zoza ›"}
                </span>
                <div className={cn("min-w-0 flex-1", m.role === "user" && "text-foreground")}>
                  {m.typing ? <span className="inline-block h-4 w-2 translate-y-0.5 animate-blink bg-signal" /> : m.content}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto border-t border-dashed border-border px-4 py-3 sm:px-5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => handle(ex)}
                className="shrink-0 border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex items-center gap-3 border-t border-border px-4 py-3 sm:px-5">
            <span className="text-signal">›</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="token Liberty ticker LBTY x @liberty web liberty.io"
              aria-label="Message Zoza"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <Button type="submit" size="sm">
              Send <CornerDownLeftIcon />
            </Button>
          </form>
        </div>

        {/* blueprint */}
        <aside className="flex min-w-0 flex-col border border-border bg-card/50">
          <WindowBar title="blueprint.json" />
          {blueprint ? <BlueprintView bp={blueprint} wallet={address} /> : (
            <div className="grid flex-1 place-items-center p-10 text-center text-sm text-muted-foreground">
              <div className="grid justify-items-center gap-4">
                <Logo className="size-14 text-foreground/80" />
                <pre className="text-xs leading-relaxed">{"┌──────────────────────┐\n│  awaiting your idea  │\n└──────────────────────┘"}</pre>
                <p>Your token’s blueprint will take shape here.</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </Section>
  );
}

function WindowBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
      <span aria-hidden className="flex gap-1.5">
        <span className="size-2.5 border border-border" />
        <span className="size-2.5 border border-border" />
        <span className="size-2.5 bg-signal" />
      </span>
      <span className="truncate">{title}</span>
    </div>
  );
}

function BlueprintView({ bp, wallet }: { bp: Blueprint; wallet: string | null }) {
  const { tok } = bp;
  const has = (f: keyof Draft) => f in tok;
  const rows: [string, string][] = [
    ["name", tok.name || "…"],
    ["ticker", tok.ticker ? "$" + tok.ticker : "…"],
    ["x", has("x") ? (tok.x ? "@" + tok.x : "—") : "…"],
    ["website", has("website") ? tok.website || "—" : "…"],
    ["tax", `${TAX}% buy & sell`],
    [`creator_fee (${CREATOR_FEE}%)`, wallet ? shortAddr(wallet) : "creator wallet"],
    [`protocol_fee (${PROTOCOL_FEE}%)`, "protocol"],
    ["supply", fmt(SUPPLY)],
    ["network", NETWORK],
  ];
  if (tok.address) rows.push(["contract", shortAddr(tok.address)]);

  return (
    <div className="flex flex-1 flex-col p-5">
      <div className="mb-5 flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center border border-border bg-background text-sm font-bold">
          {(tok.ticker || tok.name || "··").slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{tok.name || "New token"}</p>
          <p className="text-xs text-muted-foreground">{tok.ticker ? "$" + tok.ticker : "ticker pending"}</p>
        </div>
      </div>
      <dl className="space-y-2.5 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="shrink-0 text-muted-foreground">{k}</dt>
            <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-border" />
            <dd className="truncate text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto pt-6">
        <p
          className={cn(
            "border px-3 py-2 text-xs",
            bp.live ? "border-signal/50 bg-signal/10 text-signal" : "border-border text-muted-foreground",
          )}
        >
          {bp.live ? "● " : "[ draft ] "}
          {bp.status}
        </p>
      </div>
    </div>
  );
}
