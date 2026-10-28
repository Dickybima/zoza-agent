import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/site/section";

// static density field echoing the hero tunnel's ramp
const RAMP = " .:-=+*#";
const FIELD = Array.from({ length: 9 }, (_, r) =>
  Array.from({ length: 120 }, (_, c) => {
    const d = Math.abs(Math.sin(c * 0.21 + r * 0.7) * Math.cos(r * 0.45 - c * 0.05));
    return RAMP[Math.floor(d * (RAMP.length - 1))];
  }).join(""),
).join("\n");

export function Cta() {
  return (
    <Section bordered>
      <div className="relative overflow-hidden border border-border bg-card/50 px-6 py-16 text-center sm:py-20">
        <pre aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden text-[11px] leading-[1.6] text-muted-foreground/25">
          {FIELD}
          {"\n"}
          {FIELD}
        </pre>
        <div className="relative mx-auto max-w-xl">
          <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span className="text-signal">&gt;_</span> ready when you are
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-4xl">It’s time for your vision to take form.</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Join a new generation of creators building the on-chain future with Zoza on Robinhood Chain.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/agent">
              Start creating <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
