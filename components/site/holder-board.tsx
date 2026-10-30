"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { shortAddr } from "@/lib/agent";
import { EXPLORER } from "@/lib/chain";
import { fmtTokens } from "@/lib/format";
import { OFFICIAL_ADDRESS } from "@/lib/official";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Holder = { rank: number; address: string; balance: string; pct: number; whale: boolean; diamond: boolean; burner: boolean; since: number | null };
type Board = { holders: number; diamonds: number; whales: number; top: Holder[]; me: Holder | null };
type Filter = "all" | "diamond" | "whale";

const REFRESH_MS = 60_000;
const MEDALS = ["🥇", "🥈", "🥉"];

export function HolderBoard() {
  const { address } = useWallet();
  const [board, setBoard] = useState<Board | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const r = await fetch(`/api/holders${address ? `?me=${address}` : ""}`);
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as Board;
        if (live) {
          setBoard(data);
          setStatus("ok");
        }
      } catch {
        if (live) setStatus((s) => (s === "ok" ? s : "error"));
      } finally {
        if (live) timer = setTimeout(load, REFRESH_MS);
      }
    };
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [address]);

  const rows = (board?.top ?? []).filter((h) => filter === "all" || (filter === "diamond" ? h.diamond : h.whale));
  const isMe = (a: string) => !!address && a.toLowerCase() === address.toLowerCase();
  const tabs: [Filter, string][] = [["all", "All"], ["diamond", "💎 Diamond"], ["whale", "🐋 Whales"]];

  return (
    <section id="holders" className="border-t border-dashed border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              <span className="text-signal">[ 🐋 ]</span> holders
            </p>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl md:text-4xl">
              The <span className="text-signal">$ZOZA</span> leaderboard.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Every holder, ranked live from Robinhood Chain. Hold big, never sell, burn a little: the chain remembers.
            </p>
          </div>
          <dl className="grid grid-cols-3 border border-border text-center">
            {[
              ["holders", board ? board.holders.toLocaleString("en-US") : "···"],
              ["💎 in top 50", board ? String(board.diamonds) : "···"],
              ["🐋 whales", board ? String(board.whales) : "···"],
            ].map(([k, v]) => (
              <div key={k} className="border-r border-border px-5 py-3 last:border-r-0">
                <dd className="text-xl font-semibold tabular-nums sm:text-2xl">{v}</dd>
                <dt className="mt-1 text-[11px] text-muted-foreground">{k}</dt>
              </div>
            ))}
          </dl>
        </div>

        {/* the visitor's own standing */}
        {address && status === "ok" ? (
          <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border border-signal/50 bg-signal/5 px-4 py-3 text-sm">
            <span className="text-xs text-muted-foreground">you</span>
            {board?.me ? (
              <>
                <span className="font-semibold">#{board.me.rank}</span>
                <span className="tabular-nums">{fmtTokens(BigInt(board.me.balance))} $ZOZA</span>
                <span className="text-muted-foreground">{board.me.pct.toLocaleString("en-US", { maximumFractionDigits: 3 })}% of supply</span>
                <Badges h={board.me} />
              </>
            ) : (
              <>
                <span className="text-muted-foreground">You don’t hold $ZOZA yet.</span>
                <Button variant="signal" size="sm" asChild className="ml-auto">
                  <Link href={`/token?address=${OFFICIAL_ADDRESS}`}>
                    Buy $ZOZA <ArrowRightIcon />
                  </Link>
                </Button>
              </>
            )}
          </div>
        ) : null}

        <div className="border border-border">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <div role="tablist" aria-label="Filter holders" className="flex border border-border">
              {tabs.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={filter === k}
                  onClick={() => setFilter(k)}
                  className={cn(
                    "px-3 py-1.5 text-xs transition-colors not-last:border-r not-last:border-border",
                    filter === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-signal" /> live · top 50
            </span>
          </div>

          {rows.length ? (
            <ol>
              {rows.map((h) => (
                <li
                  key={h.address}
                  className={cn(
                    "grid grid-cols-[3rem_1fr_auto] items-center gap-x-4 gap-y-1 border-b border-dashed border-border px-4 py-3 last:border-b-0 sm:grid-cols-[3rem_1fr_10rem_9rem_7rem]",
                    isMe(h.address) && "bg-signal/5",
                  )}
                >
                  <span className="text-sm tabular-nums text-muted-foreground">{MEDALS[h.rank - 1] ?? `#${h.rank}`}</span>
                  <a
                    href={`${EXPLORER}/address/${h.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-sm hover:text-signal"
                  >
                    {shortAddr(h.address)}
                    {isMe(h.address) ? <span className="ml-2 text-xs text-signal">you</span> : null}
                  </a>
                  <span className="text-right text-sm font-semibold tabular-nums sm:text-left">{fmtTokens(BigInt(h.balance))}</span>
                  <span className="col-span-2 col-start-2 flex items-center gap-2 sm:col-span-1 sm:col-start-auto">
                    <span aria-hidden className="relative h-1.5 flex-1 bg-border">
                      <span
                        className="absolute inset-y-0 left-0 bg-signal"
                        style={{ width: `${Math.min(100, Math.max(2, (h.pct / (board!.top[0]?.pct || 1)) * 100))}%` }}
                      />
                    </span>
                    <span className="w-14 text-right text-[11px] tabular-nums text-muted-foreground">
                      {h.pct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%
                    </span>
                  </span>
                  <span className="col-start-3 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
                    <Badges h={h} />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-4 py-12 text-center text-xs text-muted-foreground">
              {status === "loading"
                ? "replaying every $ZOZA transfer…"
                : status === "error"
                  ? "Robinhood Chain didn’t answer. Retrying in a minute…"
                  : filter === "all"
                    ? "No holders yet."
                    : "Nobody in the top 50 has this badge yet."}
            </p>
          )}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          🐋 whale: holds 1% of supply or more · 💎 diamond hands: has never sold or sent $ZOZA (burning doesn’t count) · 🔥 burner:
          has burned $ZOZA. Contracts like the bonding curve and the pool aren’t ranked.
        </p>
      </div>
    </section>
  );
}

function Badges({ h }: { h: Pick<Holder, "whale" | "diamond" | "burner"> }) {
  const list = [h.whale && ["🐋", "whale"], h.diamond && ["💎", "diamond hands"], h.burner && ["🔥", "burner"]].filter(Boolean) as [string, string][];
  return (
    <span className="inline-flex gap-1.5">
      {list.map(([icon, label]) => (
        <span key={label} title={label} aria-label={label} className="text-base leading-none">
          {icon}
        </span>
      ))}
    </span>
  );
}
