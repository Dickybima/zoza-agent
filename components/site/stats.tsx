"use client";

import { useMemo } from "react";

import { useTokens } from "@/lib/tokens";
import { useCountUp } from "@/hooks/use-count-up";

// Hero stats are derived from real launches, so they start at zero
export function Stats() {
  const { tokens } = useTokens();
  const { creators, avg } = useMemo(() => {
    const creators = new Set(tokens.map((t) => t.creator.toLowerCase())).size;
    const timed = tokens.filter((t) => t.launchSeconds);
    const avg = timed.length ? timed.reduce((s, t) => s + (t.launchSeconds ?? 0), 0) / timed.length : 0;
    return { creators, avg };
  }, [tokens]);

  return (
    <div className="border-t border-border bg-card/40">
      <dl className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-dashed divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="tokens_created" value={tokens.length} />
        <Stat label="avg_seconds_to_chain" value={avg} decimals={avg ? 1 : 0} />
        <Stat label="sovereign_creators" value={creators} />
      </dl>
    </div>
  );
}

function Stat({ label, value, decimals = 0 }: { label: string; value: number; decimals?: number }) {
  const v = useCountUp(value);
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-6 sm:block sm:px-6">
      <dt className="text-xs text-muted-foreground">
        <span className="text-signal">›</span> {label}
      </dt>
      <dd className="text-3xl font-semibold tabular-nums sm:mt-2 sm:text-4xl">
        {v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      </dd>
    </div>
  );
}
