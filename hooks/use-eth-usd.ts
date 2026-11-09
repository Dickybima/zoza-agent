"use client";

import { useEffect, useState } from "react";

import { IS_TESTNET } from "@/lib/chain";

// HYPE/USD for displaying prices in dollars (HYPE is Elysium's gas and quote
// currency; the "eth" names are historical). Read from Zoza's /api/eth-price
// (cached server-side), falling back to CoinGecko from the browser. On
// Elysium Testnet, HYPE has no dollar value, so amounts stay in HYPE.

let cached: { usd: number; at: number } | null = null;
const MAX_AGE = 60_000;

async function fetchEthUsd(): Promise<number | null> {
  if (IS_TESTNET) return null;
  if (cached && Date.now() - cached.at < MAX_AGE) return cached.usd;
  const tries: [string, (j: never) => unknown][] = [
    ["/api/eth-price", (j: { usd: number }) => j.usd],
    ["https://api.coingecko.com/api/v3/simple/price?ids=hyperliquid&vs_currencies=usd", (j: { hyperliquid: { usd: number } }) => j.hyperliquid.usd],
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

/** Current HYPE price in USD (null until known), refreshed every minute. */
export function useEthUsd() {
  const [usd, setUsd] = useState<number | null>(cached?.usd ?? null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchEthUsd().then((v) => alive && v && setUsd(v));
    const first = setTimeout(load, 0);
    const id = setInterval(() => document.visibilityState !== "hidden" && load(), MAX_AGE);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return usd;
}
