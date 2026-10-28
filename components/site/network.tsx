"use client";

import { useEffect, useState } from "react";

import { useTokens } from "@/lib/tokens";
import { Section, SectionHeading } from "@/components/site/section";

const CHECKS = [
  "Near-instant transaction finality",
  "Gas fees you’ll barely notice",
  "Aligned with global token standards",
  "Publicly verified contracts",
];

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s + " ".repeat(n - s.length));

/** Three ASCII blocks; a new one is "mined" every few seconds. */
function AsciiChain() {
  const { tokens } = useTokens();
  const [height, setHeight] = useState(8_402_117);
  useEffect(() => {
    const id = setInterval(() => setHeight((h) => h + 1), 2600);
    return () => clearInterval(id);
  }, []);

  const latest = tokens.length ? "$" + tokens[tokens.length - 1].ticker : "$TEST";
  const blocks = [
    { h: height - 2, label: "tx  x184" },
    { h: height - 1, label: "tx  x203" },
    { h: height, label: latest },
  ];
  const W = 12;
  const top = blocks.map(() => "┌" + "─".repeat(W) + "┐").join("     ");
  const l1 = blocks.map((b) => "│ " + pad("#" + b.h.toLocaleString("en-US"), W - 2) + " │").join("     ");
  const l2 = blocks.map((b, i) => "│ " + pad(b.label, W - 2) + " │" + (i < 2 ? " ──▶ " : "")).join("");
  const bot = blocks.map(() => "└" + "─".repeat(W) + "┘").join("     ");

  return (
    <div className="overflow-x-auto border border-border bg-card/50 p-5 sm:p-6">
      <p className="mb-5 flex items-center justify-between text-xs text-muted-foreground">
        <span>robinhood-chain://blocks</span>
        <span className="flex items-center gap-2 text-signal">
          <span className="size-1.5 animate-pulse rounded-full bg-signal" /> syncing
        </span>
      </p>
      <pre aria-label={`Latest block ${height}`} className="text-[11px] leading-snug sm:text-xs">
        {top}
        {"\n"}
        {l1}
        {"\n"}
        {l2}
        {"\n"}
        {bot}
      </pre>
      <p className="mt-5 text-xs text-muted-foreground">
        <span className="text-signal">›</span> height <span className="tabular-nums text-foreground">{height.toLocaleString("en-US")}</span> · finality ~1s
      </p>
    </div>
  );
}

export function Network() {
  return (
    <Section id="network">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading index="05" label="Built on Robinhood Chain" title="Standing on a foundation designed for scale." className="mb-6">
            Zoza runs natively on Robinhood Chain — a network that unites speed, efficiency, and openness. Every token created is a fully
            sovereign on-chain asset: transparent, verifiable, and ready to enter the ecosystem from its very first second.
          </SectionHeading>
          <ul className="space-y-2.5 text-sm">
            {CHECKS.map((c) => (
              <li key={c} className="flex gap-3">
                <span className="text-signal">[✓]</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
        <AsciiChain />
      </div>
    </Section>
  );
}
