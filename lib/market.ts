"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

import { fetchCurve, fetchTokenInfo, spotPrice } from "@/lib/curve";
import { readClient } from "@/lib/rpc";

const POLL_MS = 30_000;

export type Market = {
  /** spot price in ETH per token on the bonding curve; null until read */
  priceEth: number | null;
  graduated: boolean;
  head: bigint | null;
};

/** Live curve price and chain head for `token`, refreshed every 30 s. */
export function useMarket(token: Address) {
  const [market, setMarket] = useState<Market>({ priceEth: null, graduated: false, head: null });

  useEffect(() => {
    const client = readClient();
    let live = true;
    let curve: Address | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        curve ??= (await fetchTokenInfo(client, token)).curve;
        const [state, head] = await Promise.all([fetchCurve(client, curve), client.getBlockNumber()]);
        if (live) setMarket({ priceEth: spotPrice(state), graduated: state.graduated, head });
      } catch {
        // keep the last reading; the ticker shows placeholders until one arrives
      } finally {
        if (live) timer = setTimeout(refresh, POLL_MS);
      }
    };
    refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [token]);

  return market;
}
