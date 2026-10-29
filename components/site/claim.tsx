"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, LoaderIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { formatEther, getAddress, isAddress } from "viem";
import type { Address } from "viem";

import { CREATOR_FEE, shortAddr } from "@/lib/agent";
import { explorerTx } from "@/lib/chain";
import { claimFees, claimableBalance, feeEscrowAddress, findLaunchesBy, readCreatorToken, sweepCreatorFees } from "@/lib/fees";
import type { CreatorToken } from "@/lib/fees";
import { fmtEth, fmtUsd } from "@/lib/format";
import { readClient } from "@/lib/rpc";
import type { ChainError } from "@/lib/rpc";
import { useTokens } from "@/lib/tokens";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { useEthUsd } from "@/hooks/use-eth-usd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, SectionHeading } from "@/components/site/section";
import { TokenAvatar } from "@/components/site/token-avatar";

type Data = { escrow: Address; claimable: bigint; tokens: CreatorToken[] };
type Action = { kind: "idle" } | { kind: "busy"; label: string; status: string } | { kind: "done"; message: string; tx?: string } | { kind: "error"; message: string };

const ZERO = BigInt(0);

export function Claim() {
  const { address, openPicker, getProvider } = useWallet();
  const { tokens: local } = useTokens();
  const ethUsd = useEthUsd();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [extra, setExtra] = useState<Address[]>([]);
  const [found, setFound] = useState<Address[]>([]);
  const [addInput, setAddInput] = useState("");
  const [action, setAction] = useState<Action>({ kind: "idle" });

  const wallet = address ? getAddress(address.toLowerCase()) : null;
  // tokens this browser launched from the wallet, plus any found on-chain or added by hand
  const candidates = useMemo(() => {
    if (!wallet) return [];
    const mine = local.filter((t) => t.creator.toLowerCase() === wallet.toLowerCase()).map((t) => t.address as Address);
    const seen = new Set<string>();
    return [...mine, ...found, ...extra].filter((a) => {
      const k = a.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [wallet, local, found, extra]);
  const candidateKey = candidates.join(",");

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setLoadError(null);
    try {
      const client = readClient();
      const escrow = await feeEscrowAddress(client);
      const [claimable, tokens] = await Promise.all([
        claimableBalance(client, escrow, wallet),
        Promise.all(candidateKey ? candidateKey.split(",").map((t) => readCreatorToken(client, t as Address).catch(() => null)) : []),
      ]);
      setData({ escrow, claimable, tokens: tokens.filter((t): t is CreatorToken => !!t) });
    } catch (err) {
      setLoadError((err as Error).message || "Couldn’t read your fees from Robinhood Chain.");
    } finally {
      setLoading(false);
    }
  }, [wallet, candidateKey]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // look for launches from this wallet on-chain, in case they weren't made in this browser
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    const t = setTimeout(async () => {
      setScanning(true);
      try {
        const client = readClient();
        const list = await findLaunchesBy(client, wallet, await client.getBlockNumber());
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

  const mine = (data?.tokens ?? []).filter((t) => wallet && t.recipient.toLowerCase() === wallet.toLowerCase());
  const collectable = mine.filter((t) => t.sweepable && t.pending > ZERO);
  const pendingTotal = collectable.reduce((s, t) => s + t.pending, ZERO);
  const claimable = data?.claimable ?? ZERO;
  const total = claimable + pendingTotal;
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

  const collect = (t: CreatorToken) =>
    run(`collect-${t.token}`, [(s) => sweepCreatorFees(getProvider()!, wallet!, t.curve, s)], `$${t.symbol} fees moved to your claimable balance.`);

  const claimAll = () => {
    if (!data) return;
    const steps = collectable.map((t) => (s: (x: string) => void) => sweepCreatorFees(getProvider()!, wallet!, t.curve, (st) => s(`$${t.symbol}: ${st}`)));
    steps.push((s) => claimFees(getProvider()!, wallet!, data.escrow, s));
    run("claim", steps, `Claimed ${fmtEth(total)} ETH to ${shortAddr(wallet!)}.`);
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
        Every buy and sell of a token you launched pays you {CREATOR_FEE}%. It builds up on-chain until you claim it; one
        click sends it all to your wallet.
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
          <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
            <Stat label="ready to claim" wei={claimable} usd={usd(claimable)} loading={loading && !data} />
            <Stat label="building up on curves" wei={pendingTotal} usd={usd(pendingTotal)} loading={loading && !data} />
            <div className="flex flex-col justify-between gap-4 bg-background p-5">
              <div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-signal">›</span> total
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
                  {data ? `${fmtEth(total)} ETH` : "···"}
                </p>
                {data && usd(total) ? <p className="text-xs text-muted-foreground">≈ {usd(total)}</p> : null}
              </div>
              <Button variant="signal" size="lg" onClick={claimAll} disabled={!data || total === ZERO || busy}>
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
              loadError ?? (collectable.length ? `Claim all collects fees from ${collectable.length} token${collectable.length > 1 ? "s" : ""}, then pays you: one wallet confirmation each.` : "")
            )}
          </p>

          {/* tokens */}
          <div className="mt-10 border border-border">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground">
              <span className="text-foreground">your launches</span>
              {scanning ? (
                <span className="flex items-center gap-1.5">
                  <LoaderIcon className="size-3 animate-spin" /> searching Robinhood Chain…
                </span>
              ) : null}
              <button type="button" onClick={load} disabled={loading} className="ml-auto flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
                <RefreshCwIcon className={cn("size-3", loading && "animate-spin")} /> refresh
              </button>
            </div>
            {data?.tokens.length ? (
              <ul className="divide-y divide-dashed divide-border">
                {data.tokens.map((t) => {
                  const yours = wallet && t.recipient.toLowerCase() === wallet.toLowerCase();
                  const logo = local.find((l) => l.address.toLowerCase() === t.token.toLowerCase())?.logo;
                  return (
                    <li key={t.token} className="flex flex-wrap items-center gap-4 px-4 py-4">
                      <Link href={`/token?address=${t.token}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-signal">
                        <TokenAvatar src={logo} label={t.symbol} seed={t.token} className="size-10" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{t.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            ${t.symbol} · {shortAddr(t.token)}
                          </span>
                        </span>
                      </Link>
                      <Badge>{t.graduated ? "graduated" : "bonding curve"}</Badge>
                      <div className="w-36 text-right">
                        <p className="font-semibold tabular-nums">{t.graduated ? "—" : `${fmtEth(t.pending)} ETH`}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {!yours
                            ? `fees go to ${shortAddr(t.recipient)}`
                            : t.graduated
                              ? "pool fees arrive in your balance"
                              : !t.sweepable
                                ? "awaiting protocol sweep"
                                : (usd(t.pending) ?? "on the curve")}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!yours || !t.sweepable || t.pending === ZERO || busy}
                        onClick={() => collect(t)}
                      >
                        {action.kind === "busy" && action.label === `collect-${t.token}` ? <LoaderIcon className="animate-spin" /> : null}
                        Collect
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                {loading || scanning ? "reading your launches…" : "No launches from this wallet found yet. Add a token below if one is missing."}
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
            Collect moves a token’s fees from its bonding curve into your claimable balance; Claim all does that for every token
            and then sends the balance to your wallet. Graduated tokens pay their pool fees into the same balance.{" "}
            {data ? (
              <a
                href={`https://robinhoodchain.blockscout.com/address/${data.escrow}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-foreground hover:text-signal"
              >
                Fee escrow contract <ArrowUpRightIcon className="size-3" />
              </a>
            ) : null}
          </p>
        </>
      )}
    </Section>
  );
}

function Stat({ label, wei, usd, loading }: { label: string; wei: bigint; usd: string | null; loading: boolean }) {
  return (
    <div className="bg-background p-5">
      <p className="text-xs text-muted-foreground">
        <span className="text-signal">›</span> {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{loading ? "···" : `${fmtEth(wei)} ETH`}</p>
      {!loading && usd ? <p className="text-xs text-muted-foreground">≈ {usd}</p> : null}
    </div>
  );
}
