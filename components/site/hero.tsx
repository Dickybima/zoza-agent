"use client";

import Link from "next/link";
import { ArrowDownIcon, ArrowRightIcon } from "lucide-react";

import { VanishRun } from "@/components/ui/hero-ascii-tunnel";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <div className="relative">
      <VanishRun className="text-foreground">
        <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-[2.75rem]">
          Say the word.
          <br />
          <span className="text-signal">It’s on-chain.</span>
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A name, a ticker, a link to your world. Zoza writes the contract, wires your 2% creator
          share, and mints it on Robinhood Chain before your coffee cools.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button asChild>
            <Link href="/agent">
              Start creating <ArrowRightIcon />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/explore">Explore tokens</Link>
          </Button>
        </div>
      </VanishRun>

      {/* corner readouts framing the tunnel */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-6xl items-end justify-between px-4 pb-6 text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:px-6">
        <span className="flex items-center gap-2">
          <ArrowDownIcon className="size-3.5 animate-bounce" /> scroll
        </span>
        <span className="hidden sm:inline">no code // no gatekeepers // just launch</span>
      </div>
    </div>
  );
}
