"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, RefreshCwIcon, RocketIcon } from "lucide-react";

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
  shortAddr,
} from "@/lib/agent";
import type { Draft, Field } from "@/lib/agent";
import { explorerTx } from "@/lib/chain";
import { launchToken } from "@/lib/launchpad";
import type { LaunchError, LaunchResult } from "@/lib/launchpad";
import { newImageSeed, tokenImageUrl } from "@/lib/token-image";
import { useTokens } from "@/lib/tokens";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import MorphOrb from "@/components/ui/ai-thiking-orb-and-input";
import { TokenAvatar } from "@/components/site/token-avatar";

type Blueprint = { tok: Draft & { address?: string }; status: string; live?: boolean; tx?: string };
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

/** Types `text` into the orb's input (only while it is idle and editable). */
function fillPrompt(text: string) {
  const el = document.querySelector<HTMLInputElement>(".mo-field");
  if (!el || el.closest("[inert]")) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

const frames = (n = 2) =>
  new Promise<void>((r) => {
    const step = (k: number) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
    step(n);
  });

/** Resolves once the orb reaches `phase` (or after `ms`). */
function waitPhase(root: Element, phase: string, ms = 3000) {
  return new Promise<void>((resolve) => {
    if (root.getAttribute("data-phase") === phase) return resolve();
    const done = () => (mo.disconnect(), clearTimeout(t), resolve());
    const mo = new MutationObserver(() => root.getAttribute("data-phase") === phase && done());
    const t = setTimeout(done, ms);
    mo.observe(root, { attributes: true, attributeFilter: ["data-phase"] });
  });
}

/** Mirrors the orb's data-phase (idle, think, answered, …) into React state. */
function useOrbPhase() {
  const [phase, setPhase] = useState("idle");
  useEffect(() => {
    const root = document.querySelector(".mo-root");
    if (!root) return;
    const mo = new MutationObserver(() => setPhase(root.getAttribute("data-phase") ?? "idle"));
    mo.observe(root, { attributes: true, attributeFilter: ["data-phase"] });
    return () => mo.disconnect();
  }, []);
  return phase;
}

export function AgentConsole() {
  const { address, connect, getProvider } = useWallet();
  const router = useRouter();
  const { publish } = useTokens();
  const phase = useOrbPhase();
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [log, setLog] = useState<Turn[]>([]);
  const [ready, setReady] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [goExplore, setGoExplore] = useState(false);
  const draftRef = useRef<Draft | null>(null);
  const askingRef = useRef<Field | null>(null);
  const readyRef = useRef(false);

  // readyRef is read inside the orb's async flow; `ready` drives the Launch buttons
  const markReady = (v: boolean) => {
    readyRef.current = v;
    setReady(v);
  };

  const render = (tok: Draft, status: string) => setBlueprint({ tok: { ...tok }, status });

  const askNext = (): string => {
    const draft = draftRef.current!;
    // artwork is generated as soon as the token has a name
    if (draft.name && draft.seed === undefined) draft.seed = newImageSeed();
    const f = nextMissing(draft);
    if (f) {
      askingRef.current = f;
      render(draft, "gathering details");
      return QUESTIONS[f];
    }
    askingRef.current = null;
    markReady(true);
    render(draft, "awaiting confirmation");
    return `${draft.name} · $${draft.ticker} · ${draft.x ? "@" + draft.x : "no X"} · ${draft.website || "no website"}. ${TAX}% tax: ${CREATOR_FEE}% to you, ${PROTOCOL_FEE}% protocol. Press Launch to go live, or edit any field.`;
  };

  const deploy = async (): Promise<string> => {
    const tok = draftRef.current!;
    const wallet = address ?? (await connect());
    const provider = getProvider();
    if (!wallet || !provider) return "No wallet connected, so nothing was launched. Press Launch to try again.";

    let result: LaunchResult;
    const sentAt = performance.now();
    try {
      result = await launchToken(
        provider,
        wallet,
        {
          name: tok.name!,
          ticker: tok.ticker!,
          x: tok.x ?? null,
          website: tok.website ?? null,
          logo: tokenImageUrl(tok.name!, tok.seed ?? 0),
          creatorTaxBps: CREATOR_FEE * 100,
        },
        (status) => render(tok, status),
      );
    } catch (err) {
      const e = err as LaunchError;
      render(tok, e.rejected ? "rejected in wallet" : "launch failed");
      return e.rejected
        ? "Launch cancelled in your wallet. Press Launch to try again."
        : `Launch failed: ${e.message}${/again\.?$/i.test(e.message) ? "" : " Press Launch to try again."}`;
    }

    draftRef.current = null;
    markReady(false);
    setBlueprint({ tok: { ...tok, address: result.token }, status: `LIVE on ${NETWORK}`, live: true, tx: result.hash });
    publish({
      name: tok.name!,
      ticker: tok.ticker!,
      x: tok.x ?? null,
      website: tok.website ?? null,
      address: result.token,
      curve: result.curve,
      logo: tokenImageUrl(tok.name!, tok.seed ?? 0),
      block: Number(result.block),
      creator: wallet,
      tx: result.hash,
      createdAt: Date.now(),
      launchSeconds: Math.round((performance.now() - sentAt) / 100) / 10,
    });
    setGoExplore(true); // redirect once the orb has shown the result
    return `${tok.name} ($${tok.ticker}) is live on ${NETWORK}. Contract ${shortAddr(result.token)}. ${CREATOR_FEE}% of every trade flows to ${shortAddr(wallet)}. Opening Explore…`;
  };

  const reply = async (text: string): Promise<string> => {
    const p = parsePrompt(text);
    const found = Object.keys(p).length > 0;
    const draft = draftRef.current;

    // commands only count when the message carries no token details
    if (!found && draft && isCancel(text)) {
      draftRef.current = null;
      askingRef.current = null;
      markReady(false);
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
      return "To refine a detail, try name Liberty, ticker LBTY, x @liberty or web liberty.io. Press Launch when you’re ready.";
    }

    markReady(false);
    return askNext();
  };

  const onSubmit = async (text: string) => {
    const answer = await reply(text);
    setLog((l) => [...l, { you: text, zoza: answer }]);
    return answer;
  };

  // new artwork for the current draft
  const restyle = () => {
    const d = draftRef.current;
    if (!d?.name) return;
    d.seed = newImageSeed();
    setBlueprint((bp) => (bp ? { ...bp, tok: { ...d } } : bp));
  };

  // after a launch, let the creator read the orb's result, then open Explore
  useEffect(() => {
    if (!goExplore || phase !== "answered") return;
    const t = setTimeout(() => router.push("/explore"), 2500);
    return () => clearTimeout(t);
  }, [goExplore, phase, router]);

  // Launch button: replays "launch" through the orb so the same flow runs
  // (wallet picker if needed → wallet confirmation → deploy), with animation.
  const launch = async () => {
    const root = document.querySelector(".mo-root");
    const form = document.querySelector<HTMLFormElement>(".mo-input");
    if (!root || !form || launching || !readyRef.current) return;
    setLaunching(true);
    try {
      if (root.getAttribute("data-phase") === "answered") {
        document.querySelector<HTMLButtonElement>(".mo-reset")?.click();
        await waitPhase(root, "idle");
      }
      if (root.getAttribute("data-phase") !== "idle") return;
      fillPrompt("launch");
      await frames();
      form.requestSubmit();
    } finally {
      setLaunching(false);
    }
  };
  const canLaunch = ready && !launching && (phase === "idle" || phase === "answered");

  return (
    <div className="relative" data-launch-ready={ready && phase === "answered" ? "" : undefined}>
      <MorphOrb onSubmit={onSubmit} minThinkMs={1400} />

      {/* Launch buttons live in a stage-sized layer so they line up with the orb
          on every screen (below xl the side panels make this wrapper taller). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-dvh">
        {/* beside the orb's Reply button, under the summary card */}
        {ready && phase === "answered" ? (
          <Button
            variant="signal"
            onClick={launch}
            disabled={!canLaunch}
            className="pointer-events-auto absolute left-[calc(50%+6px)] top-[calc(46%+96px)] h-[35px] animate-in fade-in-0 duration-300"
          >
            <RocketIcon /> Launch
          </Button>
        ) : null}
        {/* …and above the input pill once the user is back in the composer */}
        {ready && phase === "idle" ? (
          <Button
            variant="signal"
            onClick={launch}
            disabled={!canLaunch}
            className="pointer-events-auto absolute bottom-[140px] left-1/2 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
            <RocketIcon /> Launch ${blueprint?.tok.ticker}
          </Button>
        ) : null}
      </div>

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
          <BlueprintPanel
            bp={blueprint}
            wallet={address}
            onLaunch={ready ? launch : undefined}
            canLaunch={canLaunch}
            onRestyle={!launching && (phase === "idle" || phase === "answered") ? restyle : undefined}
          />
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
        <span className="text-foreground">skip</span>. Launching sends a real transaction on {NETWORK}: you pay the
        launch fee and gas shown in your wallet.
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

function BlueprintPanel({
  bp,
  wallet,
  onLaunch,
  canLaunch,
  onRestyle,
}: {
  bp: Blueprint | null;
  wallet: string | null;
  onLaunch?: () => void;
  canLaunch: boolean;
  onRestyle?: () => void;
}) {
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
          <TokenAvatar
            src={tok.name ? tokenImageUrl(tok.name, tok.seed ?? 0) : null}
            label={tok.ticker || tok.name || ""}
            className="size-16"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{tok.name || "New token"}</p>
            <p className="text-xs text-muted-foreground">{tok.ticker ? "$" + tok.ticker : "ticker pending"}</p>
            {tok.name && !bp.live ? (
              <button
                type="button"
                onClick={onRestyle}
                disabled={!onRestyle}
                className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                <RefreshCwIcon className="size-3" /> new artwork
              </button>
            ) : null}
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
        {onLaunch && !bp.live ? (
          <Button variant="signal" className="mt-3 w-full" onClick={onLaunch} disabled={!canLaunch}>
            <RocketIcon /> Launch ${bp.tok.ticker}
          </Button>
        ) : null}
        {bp.live ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Link href="/explore" className="flex items-center gap-1.5 text-foreground hover:text-signal">
              View in Explore <ArrowRightIcon className="size-3.5" />
            </Link>
            {bp.tx ? (
              <a href={explorerTx(bp.tx)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                View transaction ↗
              </a>
            ) : null}
          </div>
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
