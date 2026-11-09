"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { CHAIN_NAME, zozaChain } from "@/lib/chain";
import { fmtUsd } from "@/lib/format";
import { montraApi } from "@/lib/montra";
import { readClient } from "@/lib/rpc";
import { pageHidden } from "@/lib/visible";
import { useEthUsd } from "@/hooks/use-eth-usd";

const POLL_MS = 30_000;

// A scrolling strip of live Elysium and Montra figures.
export function LiveTicker() {
  const hypeUsd = useEthUsd();
  const [head, setHead] = useState<bigint | null>(null);
  const [launched, setLaunched] = useState<bigint | null>(null);


  useEffect(() => {
    const client = readClient();
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loaded = false;
    const refresh = async () => {
      try {
        if (loaded && pageHidden()) return;
        const [h, n] = await Promise.all([
          client.getBlockNumber(),
          montraApi
            .stats()
            .then((s) => (typeof s.tokensLaunched === "number" ? BigInt(s.tokensLaunched) : null))
            .catch(() => null),
        ]);
        loaded = true;
        if (live) {
          setHead(h);
          if (n !== null) setLaunched(n);
        }
      } catch {
        // keep the last reading; placeholders until one arrives
      } finally {
        if (live) timer = setTimeout(refresh, POLL_MS);
      }
    };
    refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  const dash = "···";
  const items: [string, string, boolean?][] = [
    ["network", CHAIN_NAME, true],
    ["launchpad", "Montra", true],
    ["hype", hypeUsd ? fmtUsd(hypeUsd) : dash],
    ["tokens on montra", launched !== null ? launched.toLocaleString("en-US") : dash],
    ["chain id", String(zozaChain.id)],
    ["block", head !== null ? `#${head.toLocaleString("en-US")}` : dash],
    ["", "hyperevm ⇄ elysium bridge live"],
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
      href="/explore"
      aria-label={`Live ${CHAIN_NAME} data. Open Explore.`}
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
