"use client";

import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon, LoaderIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { formatEther } from "viem";

import { shortAddr } from "@/lib/agent";
import { EXPLORER } from "@/lib/chain";
import { fmtEth, fmtTokens, fmtUsd, fmtUsdPrice } from "@/lib/format";
import { usePortfolio } from "@/lib/portfolio";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { useEthUsd } from "@/hooks/use-eth-usd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/site/section";
import { TokenAvatar } from "@/components/site/token-avatar";

// allocation bar colors: signal first, then fading shades
const SHADES = ["bg-signal", "bg-signal/70", "bg-signal/45", "bg-signal/25", "bg-muted-foreground/40", "bg-muted-foreground/25"];

export function Portfolio() {
  const { address, openPicker } = useWallet();
  const { data, status, refresh } = usePortfolio(address);
  const ethUsd = useEthUsd();

  const usd = (eth: number) => (ethUsd ? fmtUsd(eth * ethUsd) : null);
  const ethNum = data ? Number(formatEther(data.eth)) : 0;
  const tokensEth = data ? data.holdings.reduce((s, h) => s + h.valueEth, 0) : 0;
  const claimEth = data ? Number(formatEther(data.claimable)) : 0;
  const totalEth = ethNum + tokensEth + claimEth;
  const slices = data
    ? [
        ...data.holdings.filter((h) => h.valueEth > 0).map((h) => ({ label: `$${h.symbol}`, eth: h.valueEth })),
        { label: "HYPE", eth: ethNum },
        ...(claimEth > 0 ? [{ label: "fees", eth: claimEth }] : []),
      ].filter((s) => s.eth > 0)
    : [];

  if (!address) {
    return (
      <Section>
        <Heading />
        <div className="grid place-items-center border border-dashed border-border px-6 py-16 text-center">
          <WalletIcon className="mb-4 size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connect a wallet to see everything it holds across Zoza.</p>
          <Button variant="signal" className="mt-6" onClick={openPicker}>
            Connect wallet
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section>
      <Heading />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-foreground hover:text-signal">
          {shortAddr(address)} <ArrowUpRightIcon className="size-3" />
        </a>
        <button type="button" onClick={refresh} className="ml-auto flex items-center gap-1.5 hover:text-foreground">
          <RefreshCwIcon className={cn("size-3", status === "loading" && "animate-spin")} /> refresh
        </button>
      </div>

      {/* totals */}
      <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="net worth" big value={data ? usd(totalEth) ?? `${totalEth.toFixed(4)} HYPE` : null} sub={data ? `${totalEth.toFixed(4)} HYPE` : null} />
        <Stat label="HYPE" value={data ? `${fmtEth(data.eth)} HYPE` : null} sub={data ? usd(ethNum) : null} />
        <Stat label={`tokens (${data?.holdings.length ?? 0})`} value={data ? usd(tokensEth) ?? `${tokensEth.toFixed(4)} HYPE` : null} sub={data ? `${tokensEth.toFixed(4)} HYPE at spot` : null} />
        <Stat
          label="claimable fees"
          value={data ? `${fmtEth(data.claimable)} HYPE` : null}
          sub={data ? (data.claimable > BigInt(0) ? <Link href="/claim" className="text-signal hover:underline">claim now →</Link> : `${data.launched} token${data.launched === 1 ? "" : "s"} launched`) : null}
        />
      </div>

      {/* allocation */}
      {slices.length ? (
        <div className="mt-6">
          <div className="flex h-3 overflow-hidden border border-border">
            {slices.map((s, i) => (
              <span key={s.label} title={`${s.label} ${((s.eth / totalEth) * 100).toFixed(1)}%`} className={SHADES[Math.min(i, SHADES.length - 1)]} style={{ width: `${(s.eth / totalEth) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {slices.map((s, i) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className={cn("size-2", SHADES[Math.min(i, SHADES.length - 1)])} />
                {s.label} {((s.eth / totalEth) * 100).toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* holdings */}
      <div className="mt-10 border border-border">
        <div className="hidden grid-cols-[1fr_9rem_8rem_9rem_7rem] gap-4 border-b border-border px-4 py-3 text-[11px] uppercase tracking-[0.15em] text-muted-foreground md:grid">
          <span>token</span>
          <span className="text-right">balance</span>
          <span className="text-right">price</span>
          <span className="text-right">value</span>
          <span />
        </div>
        {data?.holdings.length ? (
          <ul className="divide-y divide-dashed divide-border">
            {data.holdings.map((h) => {
              const graduated = h.graduated;
              return (
                <li key={h.token} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-4 md:grid-cols-[1fr_9rem_8rem_9rem_7rem]">
                  <Link href={`/token?address=${h.token}`} className="flex min-w-0 items-center gap-3 hover:text-signal">
                    <TokenAvatar src={h.logo} label={h.symbol} seed={h.token} className="size-10" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 truncate font-semibold">
                        {h.name}
                        {h.mine ? <Badge variant="signal">yours</Badge> : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        ${h.symbol} · {graduated ? "graduated" : "Montra pool"}
                      </span>
                    </span>
                  </Link>
                  <span className="text-right text-sm tabular-nums md:order-none">{fmtTokens(h.balance)}</span>
                  <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">
                    {ethUsd ? fmtUsdPrice(h.priceEth * ethUsd) : `${h.priceEth.toExponential(2)} HYPE`}
                  </span>
                  <span className="text-right md:text-right">
                    <span className="block text-sm font-semibold tabular-nums">{usd(h.valueEth) ?? `${h.valueEth.toFixed(5)} HYPE`}</span>
                    {totalEth > 0 ? (
                      <span className="block text-[11px] text-muted-foreground">
                        {((h.valueEth / totalEth) * 100).toFixed(1)}%{h.exitEth !== null ? ` · exit ≈ ${fmtEth(h.exitEth)} HYPE` : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="col-span-2 flex justify-end gap-2 md:col-span-1">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/token?address=${h.token}`}>
                        Trade <ArrowRightIcon />
                      </Link>
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-12 text-center text-xs text-muted-foreground">
            {status === "loading" || (!data && status !== "error") ? (
              <span className="inline-flex items-center gap-2">
                <LoaderIcon className="size-3 animate-spin" /> reading your wallet on Elysium…
              </span>
            ) : status === "error" ? (
              "Elysium didn’t answer. Retrying shortly…"
            ) : (
              <>
                <p>No Montra tokens in this wallet yet.</p>
                <div className="mt-5 flex justify-center gap-2">
                  <Button variant="signal" size="sm" asChild>
                    <Link href="/terminal">Swap in the terminal</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/explore">Explore tokens</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Holdings and values come from Montra’s indexer at each pool’s price; “exit” is what selling the whole bag into its pool would
        return now, after fees, quoted on-chain. Claimable fees are what your tokens’ pools hold for you. Refreshes every 30 seconds.
      </p>
    </Section>
  );
}

function Heading() {
  return (
    <SectionHeading index="09" label="Portfolio" title="Everything you hold, in one place.">
      Connect a wallet and Zoza reads it straight from Elysium: your HYPE, every Zoza token you hold, what it’s worth, and
      the fees waiting for you.
    </SectionHeading>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: string | null; sub?: React.ReactNode; big?: boolean }) {
  return (
    <div className="bg-background p-5">
      <p className="text-xs text-muted-foreground">
        <span className="text-signal">›</span> {label}
      </p>
      <p className={cn("mt-2 font-semibold tabular-nums", big ? "text-3xl text-signal sm:text-4xl" : "text-2xl")}>{value ?? "···"}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
