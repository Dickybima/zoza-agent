"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Token artwork with a graceful fallback: a shimmer while the (possibly
 * freshly generated) image loads, and the ticker's initials if it fails.
 */
export function TokenAvatar({
  src,
  label,
  className,
}: {
  src?: string | null;
  label: string;
  className?: string;
}) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setState("loading");
  }
  const initials = (label || "··").replace(/^\$/, "").slice(0, 2).toUpperCase();
  const showImg = !!src && state !== "error";

  return (
    <span
      className={cn(
        "relative grid size-11 shrink-0 place-items-center overflow-hidden border border-border bg-background text-sm font-bold",
        className,
      )}
    >
      {!showImg || state === "loading" ? <span aria-hidden>{initials}</span> : null}
      {showImg && state === "loading" ? (
        <span aria-hidden className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-transparent" />
      ) : null}
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={`${label} logo`}
          className={cn("absolute inset-0 size-full object-cover transition-opacity", state === "ok" ? "opacity-100" : "opacity-0")}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
        />
      ) : null}
    </span>
  );
}
