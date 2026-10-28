"use client";

import { useEffect, useRef, useState } from "react";

/** Eases from the previous value to `target` over `ms` (ease-out cubic). */
export function useCountUp(target: number, ms = 1400) {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const v = origin + (target - origin) * (1 - Math.pow(1 - p, 3));
      setValue(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return value;
}
