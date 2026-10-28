"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// Classic spreading-fire automaton drawn as ASCII. Heat rises from a drifting
// source row and cools as it climbs; the pointer stokes the columns beneath it.
const RAMP = " .,:;-=+*#%@";
const MAX_HEAT = 36;
const CELL_W = 10;
const CELL_H = 16;

export function AsciiFire({
  intensity = 0.6,
  flare = 0,
  className,
}: {
  /** 0–1: how tall the flames burn at rest */
  intensity?: number;
  /** change this value to make the fire roar for a few seconds */
  flare?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intensityRef = useRef(intensity);
  const flareAtRef = useRef(0);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);
  useEffect(() => {
    if (flare) flareAtRef.current = performance.now();
  }, [flare]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cols = 0;
    let rows = 0;
    let heat = new Uint8Array(0);
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let frame = 0;
    let hot = "#fff";
    let signal = "#2fe0b5";
    let cool = "#555";
    let pointerX = -1;
    let stoke = 0;

    const readColors = () => {
      const cs = getComputedStyle(canvas);
      signal = cs.color;
      hot = cs.getPropertyValue("--foreground").trim() || hot;
      cool = cs.getPropertyValue("--muted-foreground").trim() || cool;
    };

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      cols = Math.ceil(width / CELL_W);
      rows = Math.ceil(height / CELL_H);
      heat = new Uint8Array(cols * rows);
    };

    const step = (now: number) => {
      const flareP = Math.max(0, 1 - (now - flareAtRef.current) / 3000);
      const level = Math.min(1, intensityRef.current + flareP * 0.5);
      const t = now / 1000;
      const base = (rows - 1) * cols;
      for (let x = 0; x < cols; x++) {
        const n = 0.5 + 0.25 * Math.sin(x * 0.23 + t * 2.1) + 0.25 * Math.sin(x * 0.071 - t * 1.3 + 1.7);
        const near = pointerX >= 0 ? Math.max(0, 1 - Math.abs(x - pointerX) / 9) * stoke : 0;
        const src = MAX_HEAT * Math.min(1, level * (0.35 + 0.65 * n) + near * 0.6);
        heat[base + x] = Math.max(0, Math.round(src) - (Math.random() < 0.3 ? 3 : 0));
      }
      // heat lasts about MAX_HEAT / (1/3 + decay) rows; scale the decay so the
      // flames reach roughly 75% of any box
      const decay = Math.min(1, Math.max(0.25, MAX_HEAT / 0.75 / rows - 1 / 3));
      for (let y = 1; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const r = Math.floor(Math.random() * 3);
          const to = (y - 1) * cols + Math.min(cols - 1, Math.max(0, x - r + 1));
          heat[to] = Math.max(0, heat[y * cols + x] - (r & 1) - (Math.random() < decay ? 1 : 0));
        }
      }
      stoke *= 0.96;
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `700 13px ${getComputedStyle(canvas).fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = heat[y * cols + x] / MAX_HEAT;
          if (v < 0.06) continue;
          ctx.globalAlpha = Math.min(1, v * 2.2);
          ctx.fillStyle = v > 0.75 ? hot : v > 0.28 ? signal : cool;
          ctx.fillText(RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))], x * CELL_W + CELL_W / 2, y * CELL_H + CELL_H / 2);
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      // ~30 fps is plenty for fire and halves the work
      if (frame++ % 2 === 0) {
        if (frame % 60 === 1) readColors();
        step(now);
        draw();
      }
      if (visible) raf = requestAnimationFrame(loop);
    };

    readColors();
    resize();
    if (reduced) {
      for (let i = 0; i < rows * 2; i++) step(performance.now());
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) {
        for (let i = 0; i < rows * 2; i++) step(performance.now());
        draw();
      }
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was && !reduced) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);

    // stoke from the section the fire sits in, since the canvas itself ignores the pointer
    const host = canvas.parentElement;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = (e.clientX - rect.left) / CELL_W;
      stoke = Math.min(1, stoke + 0.12);
    };
    const onLeave = () => (pointerX = -1);
    host?.addEventListener("pointermove", onMove);
    host?.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host?.removeEventListener("pointermove", onMove);
      host?.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={cn("pointer-events-none block h-full w-full text-signal", className)} />;
}
