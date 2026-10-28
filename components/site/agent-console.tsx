"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import {
  CREATOR_FEE,
  NETWORK,
  PROTOCOL_FEE,
  SUPPLY,
  TAX,
  fmt,
  isCancel,
  isConfirm,
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
import MorphOrb from "@/components/ui/ai-thiking-orb-and-input";

type Blueprint = { tok: Draft & { address?: string }; status: string; live?: boolean };
type Turn = { you: string; zoza: string };

// Replies render inside the orb's answer card, so they stay short plain text.
const QUESTIONS: Record<Field, string> = {
  name: "What would you like to name your token?",
  ticker: "Now choose a ticker, 2 to 10 characters, like LBTY.",
  x: "Link your project’s X account (@handle or x.com/handle), or type skip.",
  website: "Last one: what’s the website? Type skip if you don’t have one yet.",
};

const EXAMPLES = [
  "name: Moon Cat ticker: MEOW x: @mooncat website: mooncat.xyz",
  "token Moon Cat ticker MEOW x @mooncat web mooncat.xyz",
  "token ZetaCoin ticker ZETA x x.com/zetacoin website zetacoin.io",
  "token Liberty",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Types `text` into the orb's input (only while it is idle and editable). */
function fillPrompt(text: string) {
  const el = document.querySelector<HTMLInputElement>(".mo-field");
  if (!el || el.closest("[inert]")) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

export function AgentConsole() {
  const { address, connect } = useWallet();
  const { publish } = useTokens();
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [log, setLog] = useState<Turn[]>([]);
  const draftRef = useRef<Draft | null>(null);
  const askingRef = useRef<Field | null>(null);
  const readyRef = useRef(false);

  const render = (tok: Draft, status: string) => setBlueprint({ tok: { ...tok }, status });

  const askNext = (): string => {
    const draft = draftRef.current!;
    const f = nextMissing(draft);
    if (f) {
      askingRef.current = f;
      render(draft, "gathering details");
      return QUESTIONS[f];
    }
    askingRef.current = null;
    readyRef.current = true;
    render(draft, "awaiting confirmation");
    return `${draft.name} · $${draft.ticker} · ${draft.x ? "@" + draft.x : "no X"} · ${draft.website || "no website"}. ${TAX}% tax: ${CREATOR_FEE}% to you, ${PROTOCOL_FEE}% protocol. Say launch or deploy to go live, or edit any field.`;
  };

  const deploy = async (): Promise<string> => {
    const tok = draftRef.current!;
    const wallet = address ?? (await connect());
    if (!wallet) return "No wallet connected, so nothing was launched. Type launch to try again.";
    draftRef.current = null;
    readyRef.current = false;

    const startedAt = performance.now();
    for (const s of [
      "composing contract from audited architecture",
      `routing ${CREATOR_FEE}% creator fee to ${shortAddr(wallet)}`,
      "embedding X and website metadata",
      `broadcasting to ${NETWORK}`,
    ]) {
      render(tok, s);
      await sleep(650);
    }
    const addr = "0x" + randHex(40);
    setBlueprint({ tok: { ...tok, address: addr }, status: `LIVE on ${NETWORK} (demo)`, live: true });
    publish({
      name: tok.name!,
      ticker: tok.ticker!,
      x: tok.x ?? null,
      website: tok.website ?? null,
      address: addr,
      creator: wallet,
      tx: "0x" + randHex(64),
      createdAt: Date.now(),
      launchSeconds: Math.round((performance.now() - startedAt) / 100) / 10,
    });
    return `${tok.name} ($${tok.ticker}) is live on ${NETWORK} (demo). Contract ${shortAddr(addr)}. ${CREATOR_FEE}% of every trade now flows to ${shortAddr(wallet)}.`;
  };

  const reply = async (text: string): Promise<string> => {
    const p = parsePrompt(text);
    const found = Object.keys(p).length > 0;
    const draft = draftRef.current;

    // commands only count when the message carries no token details
    if (!found && draft && isCancel(text)) {
      draftRef.current = null;
      askingRef.current = null;
      readyRef.current = false;
      setBlueprint(null);
      return "Understood, draft discarded. Tell me about the next token you’d like to create.";
    }
    if (!found && isConfirm(text)) {
      if (readyRef.current) return deploy();
      if (askingRef.current) return `Almost there, a few details are still missing. ${QUESTIONS[askingRef.current]}`;
      if (!draft) return `There’s nothing to launch yet. ${QUESTIONS.name}`;
    }

    if (!draft) {
      if (!found) {
        const a = parseAnswer("name", text);
        if (!a.name) return QUESTIONS.name;
        draftRef.current = a;
      } else draftRef.current = p;
    } else if (p.name && readyRef.current && /\btoken\b/i.test(text)) {
      draftRef.current = p; // "token ..." after the summary starts a new token; "name ..." renames
    } else if (found) {
      Object.assign(draft, p);
    } else if (askingRef.current) {
      const a = parseAnswer(askingRef.current, text);
      if (!Object.keys(a).length) return `That doesn’t look quite right. ${QUESTIONS[askingRef.current]}`;
      Object.assign(draft, a);
    } else {
      return "To refine a detail, try name Liberty, ticker LBTY, x @liberty or web liberty.io. Say launch or deploy when you’re ready.";
    }

    readyRef.current = false;
    return askNext();
  };

  const onSubmit = async (text: string) => {
    const answer = await reply(text);
    setLog((l) => [...l, { you: text, zoza: answer }]);
    return answer;
  };

  return (
    <div className="relative">
      <MorphOrb onSubmit={onSubmit} minThinkMs={1400} />

      {/* compact title on small screens, where the panels stack below the stage */}
      <div className="pointer-events-none absolute inset-x-0 top-20 px-4 text-center sm:px-6 xl:hidden">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          <span className="text-signal">[ 03 ]</span> The lab
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Converse with Zoza.</h1>
        <p className="mt-2 text-xs text-muted-foreground">Examples &amp; blueprint below ↓</p>
      </div>

      {/* side panels: float beside the stage on wide screens, stack below it otherwise */}
      <div className="pointer-events-none mx-auto grid max-w-6xl gap-6 px-4 pb-16 sm:px-6 xl:absolute xl:inset-x-0 xl:top-20 xl:max-w-none xl:grid-cols-[19rem_1fr_21rem] xl:pb-0">
        <IntroPanel />
        <div className="hidden xl:block" />
        <div className="pointer-events-auto grid content-start gap-4">
          <BlueprintPanel bp={blueprint} wallet={address} />
          {log.length ? <SessionLog log={log} /> : null}
        </div>
      </div>
    </div>
  );
}

function IntroPanel() {
  return (
    <div className="pointer-events-auto content-start">
      <div className="hidden xl:block">
        <p className="mb-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
          <span className="text-signal">[ 03 ]</span> The lab
        </p>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">Converse with Zoza.</h1>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Share a name, ticker, X account and website. Zoza asks for anything missing, then launches on {NETWORK} with a{" "}
        {TAX}% tax — {CREATOR_FEE}% to you.
      </p>
      <p className="mt-6 mb-2 text-xs text-muted-foreground">{"// format"}</p>
      <pre className="border border-border bg-background/70 px-3 py-2 text-xs leading-relaxed backdrop-blur-sm">
        <span className="text-muted-foreground">name:</span> Moon Cat{"\n"}
        <span className="text-muted-foreground">ticker:</span> MEOW{"\n"}
        <span className="text-muted-foreground">x:</span> @mooncat{"\n"}
        <span className="text-muted-foreground">website:</span> mooncat.xyz
      </pre>
      <p className="mt-6 mb-2 text-xs text-muted-foreground">{"// try one"}</p>
      <ul className="grid gap-2">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              onClick={() => fillPrompt(ex)}
              className="w-full border border-border bg-background/70 px-3 py-2 text-left text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              <span className="text-signal">›</span> {ex}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Commands: <span className="text-foreground">launch</span>, <span className="text-foreground">cancel</span>,{" "}
        <span className="text-foreground">skip</span>. Demo mode — no real transactions.
      </p>
    </div>
  );
}

function PanelBar({ title }: { title: string }) {
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

function BlueprintPanel({ bp, wallet }: { bp: Blueprint | null; wallet: string | null }) {
  if (!bp) {
    return (
      <div className="border border-border bg-background/80 backdrop-blur-sm">
        <PanelBar title="blueprint.json" />
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Your token’s blueprint will take shape here.</p>
      </div>
    );
  }
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
  ];
  if (tok.address) rows.push(["contract", shortAddr(tok.address)]);

  return (
    <div className="border border-border bg-background/80 backdrop-blur-sm">
      <PanelBar title="blueprint.json" />
      <div className="p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center border border-border bg-background text-sm font-bold">
            {(tok.ticker || tok.name || "··").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{tok.name || "New token"}</p>
            <p className="text-xs text-muted-foreground">{tok.ticker ? "$" + tok.ticker : "ticker pending"}</p>
          </div>
        </div>
        <dl className="space-y-2 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-border" />
              <dd className="truncate text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <p
          className={cn(
            "mt-4 border px-3 py-2 text-xs",
            bp.live ? "border-signal/50 bg-signal/10 text-signal" : "border-border text-muted-foreground",
          )}
        >
          {bp.live ? "● " : "[ draft ] "}
          {bp.status}
        </p>
        {bp.live ? (
          <Link href="/explore" className="mt-3 flex items-center gap-1.5 text-xs text-foreground hover:text-signal">
            View in Explore <ArrowRightIcon className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function SessionLog({ log }: { log: Turn[] }) {
  return (
    <div className="border border-border bg-background/80 backdrop-blur-sm">
      <PanelBar title="session.log" />
      {/* newest exchange first */}
      <ol className="max-h-56 space-y-3 overflow-y-auto p-4 text-xs leading-relaxed">
        {[...log].reverse().map((t, i) => (
          <li key={i} className="space-y-1">
            <p>
              <span className="text-signal">you ›</span> {t.you}
            </p>
            <p className="text-muted-foreground">
              <span>zoza ›</span> {t.zoza}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
