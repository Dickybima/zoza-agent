import { LayoutDashboardIcon, MessageSquareTextIcon, PaletteIcon, ShieldCheckIcon, WalletIcon, ZapIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/site/section";

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MessageSquareTextIcon,
    title: "Intent, not instructions",
    body: "Speak as you would to an architect. Zoza understands context, interprets intent, and translates it into precise parameters.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Security from genesis",
    body: "Every contract is built on battle-tested, audited architecture — with renounced ownership and locked liquidity as the standard of trust.",
  },
  {
    icon: ZapIcon,
    title: "Speed without compromise",
    body: "From confirmation to finality in seconds. Robinhood Chain keeps every launch efficient, lightweight, and instant.",
  },
  {
    icon: WalletIcon,
    title: "Rewards for creators",
    body: "Of the 3% tax on every buy and sell, 2% flows straight to the creator’s wallet — an enduring reward for every idea you bring to life.",
  },
  {
    icon: PaletteIcon,
    title: "Identity with character",
    body: "Upload your own logo and it travels with your token everywhere — written into its on-chain metadata from the first block.",
  },
  {
    icon: LayoutDashboardIcon,
    title: "Command at a glance",
    body: "Holders, volume, and price action in real time, presented in a dashboard designed for creators.",
  },
];

export function Features() {
  return (
    <Section id="features">
      <SectionHeading index="01" label="Capabilities" title="Intelligence at every layer of your launch." />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }, i) => (
          <Card key={title}>
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center border border-border bg-background transition-colors group-hover/card:border-signal/60 group-hover/card:text-signal">
                <Icon className="size-5" strokeWidth={1.6} />
              </span>
              <span className="text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </Section>
  );
}
