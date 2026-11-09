"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { formatEther, formatUnits, getAddress, isAddress, parseEther, parseUnits } from "viem";
import type { Address } from "viem";

import { shortAddr } from "@/lib/agent";
import { explorerTx } from "@/lib/chain";
import { fetchCurve, fetchTokenInfo, launchedTokenAbi, minOut, quoteBuy, quoteSell, spotPrice, trade } from "@/lib/curve";
import type { CurveState, TokenInfo } from "@/lib/curve";
import { fmtEth, fmtTokens, fmtUsd, fmtUsdPrice } from "@/lib/format";
import { useAllLaunches } from "@/lib/launches";
import { readClient } from "@/lib/rpc";
import type { ChainError } from "@/lib/rpc";
import { EXAMPLES, parseCommand } from "@/lib/terminal";
import type { Command } from "@/lib/terminal";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { useEthUsd } from "@/hooks/use-eth-usd";

type Kind = "in" | "out" | "ok" | "err" | "dim" | "hl" | "art";
type Line = { id: number; kind: Kind; text: string; href?: string };
type Pending = { token: TokenInfo; order: Parameters<typeof trade>[4]; summary: string };

const SLIPPAGE_BPS = 500;
const ZERO = BigInt(0);
const BANNER = [
  "█████   ███   █████   ███ ",
  "   █   █   █     █   █   █",
  "  █    █   █    █    █████",
  " █     █   █   █     █   █",
  "█████   ███   █████  █   █",
];
const HELP: [string, string][] = [
  ["swap 1 hype to test", "buy a token with HYPE"],
  ["buy test with 1 hype", "same thing, said differently"],
  ["swap 1m test to hype", "sell an amount (k / m / b work)"],
  ["sell 50% test  ·  sell all test", "sell part or all of your bag"],
  ["price test", "price, market cap, curve progress"],
  ["balance  ·  balance test", "your HYPE and token balances"],
  ["tokens", "every token you can trade here"],
  ["connect  ·  clear", "connect a wallet  ·  wipe the screen"],
];

let nextId = 1;
const line = (kind: Kind, text: string, href?: string): Line => ({ id: nextId++, kind, text, href });

export function Terminal() {
  const { address, connect, getProvider } = useWallet();
  const { tokens } = useAllLaunches();
  const ethUsd = useEthUsd();
  const [lines, setLines] = useState<Line[]>(() => [
    ...BANNER.map((t) => line("art", t)),
    line("dim", ""),
    line("out", "Zoza terminal. Swap any Zoza token on Elysium by just saying it."),
    line("dim", "Try: swap 1 hype to test  ·  sell 50% test  ·  help"),
    line("dim", ""),
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines]);

  const print = (...ls: Line[]) => setLines((prev) => [...prev, ...ls]);
  const usd = (eth: number) => (ethUsd ? fmtUsd(eth * ethUsd) : null);

  /** A ticker, name or address → a Zoza token (the newest launch wins ties). */
  const resolve = (q: string): Address | null => {
    if (isAddress(q)) return getAddress(q);
    const matches = tokens.filter((t) => t.ticker.toLowerCase() === q || t.name.toLowerCase() === q);
    return matches.length ? getAddress(matches[0].address) : null;
  };

  const load = async (q: string) => {
    const address = resolve(q);
    if (!address) throw new Error(`No Zoza token called "${q}". Type tokens to see the list, or paste a contract address.`);
    const client = readClient();
    const token = await fetchTokenInfo(client, address);
    const curve = await fetchCurve(client, token.curve);
    return { client, token, curve };
  };

  const needWallet = async () => {
    const wallet = address ?? (await connect());
    const provider = getProvider();
    if (!wallet || !provider) throw new Error("No wallet connected. Type connect, or run the swap again.");
    return { wallet: getAddress(wallet.toLowerCase()), provider };
  };

  const graduatedNote = (t: TokenInfo) =>
    line("err", `$${t.symbol} has left its bonding curve, so it no longer trades here.`);

  const priceLines = (t: TokenInfo, c: CurveState) => {
    const p = spotPrice(c);
    // share of the supply bought out of the curve
    const pct = t.totalSupply > ZERO ? Math.min(100, Math.max(0, (1 - Number(formatEther(c.tokenReserve)) / Number(formatEther(t.totalSupply))) * 100)) : 0;
    return [
      line("hl", `${t.name} ($${t.symbol})  ·  ${shortAddr(t.address)}`),
      line("out", `  price      ${ethUsd ? fmtUsdPrice(p * ethUsd) : `${p.toExponential(3)} HYPE`}`),
      line("out", `  mcap       ${usd(p * Number(formatUnits(t.totalSupply, 18))) ?? "—"}`),
      line("out", `  curve      ${"█".repeat(Math.round(pct / 5)).padEnd(20, "░")} ${pct.toFixed(1)}%${c.graduated ? "  (graduated)" : ""}`),
    ];
  };

  const run = async (cmd: Command) => {
    switch (cmd.kind) {
      case "help":
        print(line("hl", "commands"), ...HELP.map(([c, d]) => line("out", `  ${c.padEnd(34)} ${d}`)), line("dim", ""));
        return;
      case "clear":
        setLines([]);
        return;
      case "connect": {
        const w = await connect();
        print(w ? line("ok", `✓ connected ${shortAddr(w)}`) : line("err", "No wallet connected."));
        return;
      }
      case "tokens": {
        const list = tokens;
        print(line("hl", `${list.length} token${list.length === 1 ? "" : "s"}`), ...list.slice(0, 30).map((t) => line("out", `  $${t.ticker.padEnd(12)} ${t.name.slice(0, 28).padEnd(30)} ${shortAddr(t.address)}`)));
        if (list.length > 30) print(line("dim", `  …and ${list.length - 30} more in Explore`));
        return;
      }
      case "price": {
        print(line("dim", "› reading the curve…"));
        const { token, curve } = await load(cmd.token);
        print(...priceLines(token, curve));
        return;
      }
      case "balance": {
        const { wallet } = await needWallet();
        const client = readClient();
        const eth = await client.getBalance({ address: wallet });
        print(line("hl", `wallet ${shortAddr(wallet)}`), line("out", `  HYPE       ${fmtEth(eth)}${usd(Number(formatEther(eth))) ? `  (${usd(Number(formatEther(eth)))})` : ""}`));
        if (cmd.token) {
          const { token } = await load(cmd.token);
          const bal = await client.readContract({ address: token.address, abi: launchedTokenAbi, functionName: "balanceOf", args: [wallet] });
          print(line("out", `  $${token.symbol.padEnd(9)} ${fmtTokens(bal)}`));
        }
        return;
      }
      case "buy": {
        const ethIn = parseEther(cmd.eth);
        if (ethIn <= ZERO) throw new Error("Spend more than 0 HYPE.");
        print(line("dim", "› quoting…"));
        const { token, curve } = await load(cmd.token);
        if (curve.graduated) return print(graduatedNote(token));
        const out = quoteBuy(curve, ethIn);
        if (out <= ZERO) throw new Error("The curve can’t fill that buy right now.");
        const summary = `swap ${fmtEth(ethIn)} HYPE → ~${fmtTokens(out)} $${token.symbol}`;
        print(
          line("hl", summary),
          line("out", `  you pay       ${fmtEth(ethIn)} HYPE${usd(Number(cmd.eth)) ? `  (${usd(Number(cmd.eth))})` : ""}`),
          line("out", `  you receive   ~${fmtTokens(out)} $${token.symbol}`),
          line("out", `  min received  ${fmtTokens(minOut(out, SLIPPAGE_BPS))} (5% slippage)`),
          line("out", `  fees          ${Number(curve.feeBps + curve.taxBps) / 100}% (incl. ${Number(curve.taxBps) / 100}% to the creator)`),
          line("ok", "confirm swap? [y/N]"),
        );
        setPending({ token, summary, order: { kind: "buy", ethIn, minTokens: minOut(out, SLIPPAGE_BPS) } });
        return;
      }
      case "sell": {
        const { wallet } = await needWallet();
        print(line("dim", "› quoting…"));
        const { client, token, curve } = await load(cmd.token);
        if (curve.graduated) return print(graduatedNote(token));
        const bal = await client.readContract({ address: token.address, abi: launchedTokenAbi, functionName: "balanceOf", args: [wallet] });
        if (bal <= ZERO) throw new Error(`You don’t hold any $${token.symbol}.`);
        const amount = cmd.amount.type === "pct" ? (bal * BigInt(Math.round(cmd.amount.pct * 100))) / BigInt(10_000) : parseUnits(cmd.amount.value, 18);
        if (amount <= ZERO) throw new Error("Sell more than 0.");
        if (amount > bal) throw new Error(`You only hold ${fmtTokens(bal)} $${token.symbol}.`);
        const out = quoteSell(curve, amount);
        const summary = `swap ${fmtTokens(amount)} $${token.symbol} → ~${fmtEth(out)} HYPE`;
        print(
          line("hl", summary),
          line("out", `  you sell      ${fmtTokens(amount)} $${token.symbol} (of ${fmtTokens(bal)})`),
          line("out", `  you receive   ~${fmtEth(out)} HYPE${usd(Number(formatEther(out))) ? `  (${usd(Number(formatEther(out)))})` : ""}`),
          line("out", `  min received  ${fmtEth(minOut(out, SLIPPAGE_BPS))} HYPE (5% slippage)`),
          line("dim", "  selling may ask for one approval first"),
          line("ok", "confirm swap? [y/N]"),
        );
        setPending({ token, summary, order: { kind: "sell", tokensIn: amount, minEth: minOut(out, SLIPPAGE_BPS) } });
        return;
      }
      case "error":
        if (cmd.message) print(line("err", cmd.message));
    }
  };

  const confirm = async (p: Pending) => {
    const { wallet, provider } = await needWallet();
    const { hash } = await trade(provider, wallet, p.token.curve, p.token.address, p.order, (s) => print(line("dim", `› ${s}…`)));
    print(line("ok", `✓ done: ${p.summary.replace("~", "")}`), line("ok", `  view transaction ↗`, explorerTx(hash)));
    const bal = await readClient().readContract({ address: p.token.address, abi: launchedTokenAbi, functionName: "balanceOf", args: [wallet] });
    print(line("out", `  you now hold ${fmtTokens(bal)} $${p.token.symbol}`), line("dim", ""));
  };

  const submit = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    print(line("in", text));
    history.current = [text, ...history.current].slice(0, 50);
    cursor.current = -1;
    setInput("");
    setBusy(true);
    try {
      if (pending) {
        setPending(null);
        if (/^(y|yes|confirm|ok|go|do it|send)$/i.test(text)) await confirm(pending);
        else print(line("dim", "swap cancelled."), line("dim", ""));
      } else {
        await run(parseCommand(text));
      }
    } catch (err) {
      const e = err as ChainError;
      print(line("err", e.rejected ? "Cancelled in your wallet." : e.message || "Something went wrong."), line("dim", ""));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => field.current?.focus());
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // without this, the same Enter's keypress lands on the wallet picker that the command opens
      e.preventDefault();
      submit(input);
    }
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const h = history.current;
      const next = Math.max(-1, Math.min(h.length - 1, cursor.current + (e.key === "ArrowUp" ? 1 : -1)));
      cursor.current = next;
      setInput(next >= 0 ? h[next] : "");
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  const prompt = pending ? "confirm? [y/N]" : `${address ? shortAddr(address) : "guest"}@elysium:~$`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 md:py-14">
      <div className="mb-6">
        <p className="mb-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
          <span className="text-signal">[ 08 ]</span> terminal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">Just say the swap.</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Type what you want in plain words. Zoza quotes it from the bonding curve, you confirm, your wallet signs.
        </p>
      </div>

      <div className="border border-border bg-background shadow-[0_0_60px_-20px_var(--signal)]" onClick={() => field.current?.focus()}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 border border-border" />
            <span className="size-2.5 border border-border" />
            <span className="size-2.5 bg-signal" />
          </span>
          <span>zoza — terminal</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", busy ? "animate-pulse bg-signal" : "bg-signal/50")} /> {busy ? "working" : "ready"}
          </span>
        </div>

        <div ref={scroller} role="log" aria-live="polite" className="h-[min(60vh,32rem)] overflow-y-auto px-4 py-4 text-[13px] leading-relaxed">
          {lines.map((l) =>
            l.href ? (
              <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer" className="block whitespace-pre text-signal underline-offset-4 hover:underline">
                {l.text}
              </a>
            ) : (
              <div
                key={l.id}
                className={cn(
                  "min-h-[1.4em] whitespace-pre-wrap break-words",
                  l.kind === "in" && "text-foreground before:mr-2 before:text-signal before:content-['›']",
                  l.kind === "out" && "whitespace-pre text-foreground/85 max-sm:whitespace-pre-wrap",
                  l.kind === "ok" && "text-signal",
                  l.kind === "err" && "text-destructive",
                  l.kind === "dim" && "text-muted-foreground",
                  l.kind === "hl" && "whitespace-pre font-semibold text-foreground max-sm:whitespace-pre-wrap",
                  l.kind === "art" && "min-h-0 whitespace-pre text-[11px] leading-[1.05] text-signal sm:text-[13px]",
                )}
              >
                {l.text}
              </div>
            ),
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-[13px]">
          <span className={cn("shrink-0", pending ? "text-signal" : "text-muted-foreground")}>{prompt}</span>
          <input
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            // readOnly rather than disabled: disabling would drop focus, which closes the wallet picker
            readOnly={busy}
            aria-busy={busy}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Terminal command"
            placeholder={busy ? "working…" : pending ? "y to swap, anything else cancels" : "swap 1 hype to test"}
            className="min-w-0 flex-1 bg-transparent text-foreground caret-signal outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(pending ? ["y", "n"] : EXAMPLES).map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={busy}
            onClick={() => submit(ex)}
            className="border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Swaps run on each token’s bonding curve with 5% slippage protection. Every swap is shown before it’s sent and signed in your
        own wallet.
      </p>
    </div>
  );
}
