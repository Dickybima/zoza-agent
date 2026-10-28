"use client";

import { useEffect, useState } from "react";

const GLYPHS = "!<>-_\\/[]{}—=+*^?#$%01ZOZA";

/**
 * Text that decodes itself: every character cycles through random glyphs and
 * locks in left to right. Server-rendered as the final text, so it reads
 * correctly without JavaScript and for screen readers.
 */
export function ScrambleText({ text, delay = 0, duration = 1100 }: { text: string; delay?: number; duration?: number }) {
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.max(0, (now - start) / duration);
      const locked = Math.floor(p * text.length);
      setShown(
        [...text]
          .map((ch, i) => (ch === " " || i < locked ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join(""),
      );
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShown(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, delay, duration]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{shown}</span>
    </>
  );
}
