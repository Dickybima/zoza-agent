"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, LoaderIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { formatEther, getAddress, isAddress } from "viem";
import type { Address } from "viem";

import { CREATOR_FEE, shortAddr } from "@/lib/agent";
import { explorerTx } from "@/lib/chain";
import { claimFees, findLaunchesBy, readCreatorToken } from "@/lib/fees";
import type { CreatorToken } from "@/lib/fees";
import { fmtEth, fmtUsd } from "@/lib/format";
import { montraToken } from "@/lib/montra";
import { readClient } from "@/lib/rpc";
import type { ChainError } from "@/lib/rpc";
import { useAllLaunches } from "@/lib/launches";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { useEthUsd } from "@/hooks/use-eth-usd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, SectionHeading } from "@/components/site/section";
import { TokenAvatar } from "@/components/site/token-avatar";

type Action = { kind: "idle" } | { kind: "busy"; label: string; status: string } | { kind: "done"; message: string; tx?: string } | { kind: "error"; message: string };

const ZERO = BigInt(0);

export function Claim() {
  const { address, openPicker, getProvider } = useWallet();
  const { tokens: local } = useAllLaunches();
  const ethUsd = useEthUsd();
  const [tokens, setTokens] = useState<CreatorToken[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [extra, setExtra] = useState<Address[]>([]);
  const [found, setFound] = useState<{ token: Address; logo?: string }[]>([]);
  const [addInput, setAddInput] = useState("");
  const [action, setAction] = useState<Action>({ kind: "idle" });

  const wallet = address ? getAddress(address.toLowerCase()) : null;
  // pools that pay this wallet (Montra's indexer), its launches from this browser, and any added by hand
  const candidates = useMemo(() => {
    if (!wallet) return [];
    const mine = local.filter((t) => t.creator.toLowerCase() === wallet.toLowerCase()).map((t) => t.address as Address);
    const seen = new Set<string>();
    return [...mine, ...found.map((f) => f.token), ...extra].filter((a) => {
      const k = a.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [wallet, local, found, extra]);
  const candidateKey = candidates.join(",");
  const logoOf = (token: string) =>
    local.find((l) => l.address.toLowerCase() === token.toLowerCase())?.logo ?? found.find((f) => f.token.toLowerCase() === token.toLowerCase())?.logo;

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setLoadError(null);
    try {
      const client = readClient();
      const list = candidateKey ? candidateKey.split(",") : [];
      const read: (CreatorToken | null)[] = [];
      for (let i = 0; i < list.length; i += 6) {
        read.push(...(await Promise.all(list.slice(i, i + 6).map((t) => readCreatorToken(client, t as Address).catch(() => null)))));
      }
      setTokens(read.filter((t): t is CreatorToken => !!t));
    } catch (err) {
      setLoadError((err as Error).message || "Couldn’t read your fees from Elysium.");
    } finally {
      setLoading(false);
    }
  }, [wallet, candidateKey]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // pools whose creator fees pay this wallet, launched here or anywhere else on Montra
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    const t = setTimeout(async () => {
      setScanning(true);
      try {
        const list = await findLaunchesBy(wallet);
        if (live) setFound(list);
      } catch {
        // best effort; local launches and manual adds still work
      } finally {
        if (live) setScanning(false);
      }
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [wallet]);

  const mine = (tokens ?? []).filter((t) => wallet && t.recipient.toLowerCase() === wallet.toLowerCase());
  const claimableList = mine.filter((t) => t.claimable > ZERO);
  const total = claimableList.reduce((s, t) => s + t.claimable, ZERO);
  const busy = action.kind === "busy";
  const usd = (wei: bigint) => (ethUsd ? fmtUsd(Number(formatEther(wei)) * ethUsd) : null);

  const run = async (label: string, steps: ((onStatus: (s: string) => void) => Promise<string>)[], done: string) => {
    const provider = getProvider();
    if (!wallet || !provider) return openPicker();
    let tx: string | undefined;
    try {
      for (const step of steps) {
        tx = await step((status) => setAction({ kind: "busy", label, status }));
      }
      setAction({ kind: "done", message: done, tx });
    } catch (err) {
      const e = err as ChainError;
      setAction({ kind: "error", message: e.rejected ? "Cancelled in your wallet." : e.message });
    }
    load();
  };

  const claimOne = (t: CreatorToken) =>
    run(`claim-${t.token}`, [(s) => claimFees(getProvider()!, wallet!, t, s)], `Claimed ${fmtEth(t.claimable)} HYPE from $${t.symbol}.`);

  const claimAll = () => {
    const steps = claimableList.map((t) => (s: (x: string) => void) => claimFees(getProvider()!, wallet!, t, (st) => s(`$${t.symbol}: ${st}`)));
    run("claim", steps, `Claimed ${fmtEth(total)} HYPE to ${shortAddr(wallet!)}.`);
  };

  const addToken = () => {
    const a = addInput.trim();
    if (!isAddress(a)) return;
    setExtra((x) => [...x, getAddress(a)]);
    setAddInput("");
  };

  return (
    <Section>
      <SectionHeading index="07" label="Claim" title="Collect what your tokens earned.">
        Every buy and sell of a token you launched pays you {CREATOR_FEE}% in HYPE. It waits in the token’s Montra pool until
        you claim it, straight to your wallet.
      </SectionHeading>

      {!wallet ? (
        <div className="grid place-items-center border border-dashed border-border px-6 py-16 text-center">
          <WalletIcon className="mb-4 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connect the wallet you launched with to see your creator fees.</p>
          <Button variant="signal" className="mt-6" onClick={openPicker}>
            Connect wallet
          </Button>
        </div>
      ) : (
        <>
          {/* totals + claim */}
          <div className="grid gap-px border border-border bg-border sm:grid-cols-2">
            <div className="bg-background p-5">
              <p className="text-xs text-muted-foreground">
                <span className="text-signal">›</span> ready to claim
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{tokens ? `${fmtEth(total)} HYPE` : "···"}</p>
              {tokens && usd(total) ? <p className="text-xs text-muted-foreground">≈ {usd(total)}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                from {claimableList.length} token{claimableList.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-col justify-end gap-3 bg-background p-5">
              <p className="text-xs text-muted-foreground">One wallet confirmation per token; each pays your wallet directly.</p>
              <Button variant="signal" size="lg" onClick={claimAll} disabled={!tokens || total === ZERO || busy}>
                {action.kind === "busy" && action.label === "claim" ? <LoaderIcon className="animate-spin" /> : null}
                {total === ZERO ? "Nothing to claim yet" : "Claim all"}
              </Button>
            </div>
          </div>

          <p
            role="status"
            className={cn(
              "mt-3 min-h-5 text-xs",
              action.kind === "error" || loadError ? "text-destructive" : action.kind === "done" ? "text-signal" : "text-muted-foreground",
            )}
          >
            {action.kind === "busy" ? (
              `› ${action.status}…`
            ) : action.kind === "error" ? (
              action.message
            ) : action.kind === "done" ? (
              <>
                ✓ {action.message}{" "}
                {action.tx ? (
                  <a href={explorerTx(action.tx)} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                    View transaction ↗
                  </a>
                ) : null}
              </>
            ) : (
              (loadError ?? "")
            )}
          </p>

          {/* tokens */}
          <div className="mt-10 border border-border">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground">
              <span className="text-foreground">your tokens</span>
              {scanning ? (
                <span className="flex items-center gap-1.5">
                  <LoaderIcon className="size-3 animate-spin" /> searching Montra…
                </span>
              ) : null}
              <button type="button" onClick={load} disabled={loading} className="ml-auto flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
                <RefreshCwIcon className={cn("size-3", loading && "animate-spin")} /> refresh
              </button>
            </div>
            {tokens?.length ? (
              <ul className="divide-y divide-dashed divide-border">
                {tokens.map((t) => {
                  const yours = wallet && t.recipient.toLowerCase() === wallet.toLowerCase();
                  return (
                    <li key={t.token} className="flex flex-wrap items-center gap-4 px-4 py-4">
                      <Link href={`/token?address=${t.token}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-signal">
                        <TokenAvatar src={logoOf(t.token)} label={t.symbol} seed={t.token} className="size-10" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{t.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            ${t.symbol} · {shortAddr(t.token)}
                          </span>
                        </span>
                      </Link>
                      <a
                        href={montraToken(t.token)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-signal"
                      >
                        Montra <ArrowUpRightIcon className="size-3" />
                      </a>
                      <div className="w-36 text-right">
                        <p className="font-semibold tabular-nums">{fmtEth(t.claimable)} HYPE</p>
                        <p className="text-[11px] text-muted-foreground">{yours ? (usd(t.claimable) ?? "in the pool") : `fees go to ${shortAddr(t.recipient)}`}</p>
                      </div>
                      <Button variant="outline" size="sm" disabled={!yours || t.claimable === ZERO || busy} onClick={() => claimOne(t)}>
                        {action.kind === "busy" && action.label === `claim-${t.token}` ? <LoaderIcon className="animate-spin" /> : null}
                        Claim
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                {loading || scanning ? "reading your tokens…" : "No tokens paying this wallet found yet. Add a token below if one is missing."}
              </p>
            )}
            <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row">
              <Input
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addToken()}
                placeholder="add a token you launched: 0x…"
                spellCheck={false}
                autoComplete="off"
              />
              <Button variant="outline" onClick={addToken} disabled={!isAddress(addInput.trim())}>
                Add token
              </Button>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Creator fees build up in each token’s Montra pool hook in HYPE; Claim calls the hook’s <code>claim</code>, which only the
            pool’s fee recipient can do, and pays your wallet directly. Tokens launched anywhere on Montra that pay this wallet are
            listed too.
          </p>
        </>
      )}
    </Section>
  );
}
