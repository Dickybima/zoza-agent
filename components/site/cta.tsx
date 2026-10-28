import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VanishRun } from "@/components/ui/hero-ascii-tunnel";
import { Section } from "@/components/site/section";

export function Cta() {
  return (
    <Section bordered>
      <div className="overflow-hidden border border-border">
        {/* same moving tunnel as the hero, framed to a card */}
        <VanishRun followPointer={false} className="h-[26rem] min-h-0! text-foreground sm:h-[30rem]">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span className="text-signal">&gt;_</span> ready when you are
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-4xl">It’s time for your vision to take form.</h2>
          <p className="text-sm text-muted-foreground">
            Join a new generation of creators building the on-chain future with Zoza on Robinhood Chain.
          </p>
          <Button asChild size="lg" className="mt-4">
            <Link href="/agent">
              Start creating <ArrowRightIcon />
            </Link>
          </Button>
        </VanishRun>
      </div>
    </Section>
  );
}
