"use client";

import { useEffect, useState } from "react";

// ETH/USD for displaying prices in dollars. Read from Zoza's /api/eth-price
// (cached server-side), falling back to Coinbase's public API from the browser.
let cached: { usd: number; at: number } | null = null;
const MAX_AGE = 60_000;

async function fetchEthUsd(): Promise<number | null> {
  if (cached && Date.now() - cached.at < MAX_AGE) return cached.usd;
  const tries: [string, (j: never) => unknown][] = [
    ["/api/eth-price", (j: { usd: number }) => j.usd],
    ["https://api.coinbase.com/v2/prices/ETH-USD/spot", (j: { data: { amount: string } }) => j.data.amount],
  ];
  for (const [url, pick] of tries) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const usd = Number(pick((await r.json()) as never));
      if (Number.isFinite(usd) && usd > 0) {
        cached = { usd, at: Date.now() };
        return usd;
      }
    } catch {
      // next source
    }
  }
  return cached?.usd ?? null;
}

/** Current ETH price in USD (null until known), refreshed every minute. */
export function useEthUsd() {
  const [usd, setUsd] = useState<number | null>(cached?.usd ?? null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchEthUsd().then((v) => alive && v && setUsd(v));
    const first = setTimeout(load, 0);
    const id = setInterval(load, MAX_AGE);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return usd;
}
