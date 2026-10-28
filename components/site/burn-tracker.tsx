"use client";

import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import { formatEther } from "viem";

import { shortAddr, timeAgo } from "@/lib/agent";
import { useBurnStats } from "@/lib/burn";
import { explorerToken, explorerTx } from "@/lib/chain";
import { fmtTokens } from "@/lib/format";
import { OFFICIAL_ADDRESS } from "@/lib/official";
import { useCountUp } from "@/hooks/use-count-up";
import { AsciiFire } from "@/components/ui/ascii-fire";
import { Button } from "@/components/ui/button";

export function BurnTracker() {
  const stats = useBurnStats(OFFICIAL_ADDRESS);
  const burned = Number(formatEther(stats.burned));
  const supply = Number(formatEther(stats.initialSupply));
  const pct = supply ? (burned / supply) * 100 : 0;
  const shown = useCountUp(burned, 2200);
  const shownPct = useCountUp(pct, 2200);

  return (
    <section id="burn" className="relative isolate overflow-hidden border-t border-dashed border-border">
      {/* the fire burns along the bottom of the section; the pointer stokes it */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[70%] [mask-image:linear-gradient(to_top,black_55%,transparent)]">
        <AsciiFire intensity={stats.status === "ok" && burned > 0 ? 0.9 : 0.6} flare={stats.flare + (stats.status === "ok" ? 1 : 0)} />
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span className="text-signal">[ 🔥 ]</span> burn tracker
          </p>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl md:text-4xl">
            Every <span className="text-signal">$ZOZA</span> burned is gone forever.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Read live from Robinhood Chain: tokens sent to the dead address or destroyed outright. Nobody types these
            numbers in. Refreshed every 30 seconds.
          </p>

          <div className="mt-10 border border-border bg-background/70 p-5 backdrop-blur-sm sm:p-6">
            <p className="text-xs text-muted-foreground">
              <span className="text-signal">›</span> total_burned
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 font-bold tabular-nums">
              <span className="text-4xl sm:text-6xl">
                {stats.status === "loading" ? (
                  <span className="animate-pulse text-muted-foreground">········</span>
                ) : stats.status === "error" ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  Math.round(shown).toLocaleString("en-US")
                )}
              </span>
              <span className="text-lg text-signal sm:text-2xl">$ZOZA</span>
            </p>

            <div className="mt-5 flex items-center gap-3 text-xs sm:text-sm">
              <span
                aria-hidden
                className="relative h-3 flex-1 border border-border bg-[repeating-linear-gradient(90deg,var(--border)_0_1px,transparent_1px_8px)]"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-signal shadow-[0_0_16px_var(--signal)] transition-[width] duration-1000"
                  style={{ width: pct > 0 ? `max(4px, ${Math.min(100, shownPct)}%)` : 0 }}
                />
              </span>
              <span className="shrink-0 tabular-nums">
                {stats.status === "ok" ? shownPct.toLocaleString("en-US", { maximumFractionDigits: pct && pct < 1 ? 4 : 2 }) : "—"}% of supply
              </span>
            </div>

            {stats.status === "error" ? (
              <p role="status" className="mt-4 text-xs text-destructive">
                Robinhood Chain didn’t answer. Retrying in 30 seconds…
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="signal" size="sm" asChild>
                <Link href={`/token?address=${OFFICIAL_ADDRESS}`}>
                  Buy $ZOZA <ArrowRightIcon />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={explorerToken(OFFICIAL_ADDRESS)} target="_blank" rel="noopener noreferrer">
                  Verify on Blockscout <ArrowUpRightIcon />
                </a>
              </Button>
            </div>
          </div>
          <p className="mt-3 hidden text-xs text-muted-foreground sm:block">{"// move your cursor over the fire to stoke it"}</p>
        </div>

        <BurnLog stats={stats} />
      </div>
    </section>
  );
}

function BurnLog({ stats }: { stats: ReturnType<typeof useBurnStats> }) {
  return (
    <div className="border border-border bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 border border-border" />
          <span className="size-2.5 border border-border" />
          <span className="size-2.5 bg-signal" />
        </span>
        <span className="truncate">burn.log</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="size-1.5 animate-pulse rounded-full bg-signal" /> live
        </span>
      </div>
      {stats.burns.length ? (
        <ol className="divide-y divide-dashed divide-border">
          {stats.burns.slice(0, 6).map((b) => (
            <li key={`${b.tx}-${b.logIndex}`}>
              <a
                href={explorerTx(b.tx)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-accent sm:text-sm"
              >
                <span aria-hidden>🔥</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold tabular-nums">{fmtTokens(b.amount)}</span>{" "}
                  <span className="text-signal">$ZOZA</span>
                  <span className="block text-muted-foreground">
                    from {shortAddr(b.from)}
                    {b.time ? ` · ${timeAgo(b.time * 1000)}` : ""}
                  </span>
                </span>
                <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-10 text-center text-xs leading-relaxed text-muted-foreground">
          {stats.status === "loading"
            ? "reading the chain…"
            : stats.status === "error"
              ? "waiting for Robinhood Chain…"
              : stats.historyOk
                ? "No burns yet. The fire is lit and waiting."
                : "Burn history is loading from Robinhood Chain…"}
        </p>
      )}
    </div>
  );
}
