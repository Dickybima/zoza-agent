"use client";

import { useMemo, useState } from "react";

import { logoSources } from "@/lib/logo";
import { cn } from "@/lib/utils";

/**
 * Token artwork that always shows something: each logo source is tried in
 * turn (see logoSources), with a shimmer while the possibly freshly generated
 * image loads, and a pattern unique to the token if none of them load.
 */
export function TokenAvatar({
  src,
  label,
  seed,
  className,
}: {
  src?: string | null;
  label: string;
  /** what the fallback pattern is derived from; defaults to the label */
  seed?: string;
  className?: string;
}) {
  const sources = useMemo(() => logoSources(src), [src]);
  const [attempt, setAttempt] = useState({ key: sources.join("|"), index: 0, loaded: false });
  // a new logo starts over from its first source
  const key = sources.join("|");
  if (attempt.key !== key) setAttempt({ key, index: 0, loaded: false });

  const current = attempt.key === key ? sources[attempt.index] : sources[0];
  const loaded = attempt.key === key && attempt.loaded;
  const next = () => setAttempt((a) => ({ ...a, index: a.index + 1, loaded: false }));

  return (
    <span
      className={cn("relative grid size-11 shrink-0 place-items-center overflow-hidden border border-border bg-background", className)}
    >
      {!loaded ? <Pattern seed={seed || label || "zoza"} /> : null}
      {current && !loaded ? <span aria-hidden className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/70 to-transparent" /> : null}
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={current}
          src={current}
          alt={`${label} logo`}
          className={cn("absolute inset-0 size-full object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")}
          // an image that finished loading before hydration fires no load event
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0 && !loaded) setAttempt((a) => ({ ...a, loaded: true }));
          }}
          onLoad={() => setAttempt((a) => ({ ...a, loaded: true }))}
          onError={next}
        />
      ) : null}
      {!current ? <span className="sr-only">{label} logo</span> : null}
    </span>
  );
}

/** A mirrored 5×5 pixel mark derived from `seed`, in the signal color. */
function Pattern({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 2166136261;
    for (const ch of seed.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const out: { x: number; y: number; o: number }[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
        if (h % 100 < 48) continue;
        const o = 0.35 + ((h >>> 8) % 65) / 100;
        out.push({ x, y, o });
        if (x < 2) out.push({ x: 4 - x, y, o });
      }
    }
    return out;
  }, [seed]);

  return (
    <svg aria-hidden viewBox="-1 -1 7 7" className="absolute inset-0 size-full text-signal">
      {cells.map((c, i) => (
        <rect key={i} x={c.x + 0.06} y={c.y + 0.06} width={0.88} height={0.88} fill="currentColor" opacity={c.o} />
      ))}
    </svg>
  );
}
