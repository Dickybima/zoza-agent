"use client";

import Link from "next/link";
import { formatEther } from "viem";

import { useBurnStats } from "@/lib/burn";
import { fmtTokens, fmtUsd, fmtUsdPrice } from "@/lib/format";
import { useMarket } from "@/lib/market";
import { OFFICIAL_ADDRESS } from "@/lib/official";
import { useEthUsd } from "@/hooks/use-eth-usd";

// A scrolling strip of live $ZOZA figures, all read on-chain.
export function LiveTicker() {
  const market = useMarket(OFFICIAL_ADDRESS);
  const burn = useBurnStats(OFFICIAL_ADDRESS);
  const ethUsd = useEthUsd();

  const burned = Number(formatEther(burn.burned));
  const supply = Number(formatEther(burn.initialSupply));
  const priceUsd = market.priceEth !== null && ethUsd ? market.priceEth * ethUsd : null;
  const known = burn.status === "ok";
  const dash = "···";

  const items: [string, string, boolean?][] = [
    ["$ZOZA", priceUsd !== null ? fmtUsdPrice(priceUsd) : dash, true],
    ["circ mcap", priceUsd !== null && known ? fmtUsd(priceUsd * (supply - burned)) : dash],
    ["burned", known ? `${fmtTokens(burn.burned)} (${((burned / supply) * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%)` : dash, true],
    ["status", market.graduated ? "graduated" : "bonding curve"],
    ["eth", ethUsd ? fmtUsd(ethUsd) : dash],
    ["block", market.head !== null ? `#${market.head.toLocaleString("en-US")}` : dash],
    ["", "buy · burn · repeat 🔥"],
    ["", "say the word. it’s on-chain."],
  ];

  const run = (copy: number) => (
    <span aria-hidden={copy > 0 || undefined} className="flex shrink-0 items-center">
      {items.map(([k, v, hot], i) => (
        <span key={i} className="flex items-center gap-2 px-5">
          {k ? <span className="text-muted-foreground">{k}</span> : null}
          <span className={hot ? "text-signal" : "text-foreground"}>{v}</span>
          <span aria-hidden className="pl-5 text-muted-foreground/50">{"//"}</span>
        </span>
      ))}
    </span>
  );

  return (
    <Link
      href={`/token?address=${OFFICIAL_ADDRESS}`}
      aria-label="Live $ZOZA market data. Open the $ZOZA token page."
      className="group relative flex h-7 items-center overflow-hidden border-b border-border bg-background text-[11px] uppercase tracking-[0.14em]"
    >
      <span className="relative z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-border bg-background px-3 font-semibold text-signal">
        <span className="size-1.5 animate-pulse rounded-full bg-signal" /> live
      </span>
      <span className="ticker-track flex w-max group-hover:[animation-play-state:paused]">
        {run(0)}
        {run(1)}
      </span>
    </Link>
  );
}
