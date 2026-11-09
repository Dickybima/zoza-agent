"use client";

import { useCallback, useEffect, useState } from "react";
import { getAddress } from "viem";
import type { Address } from "viem";

import { readCreatorToken } from "@/lib/fees";
import { fetchPool, montraApi, quote } from "@/lib/montra";
import { readClient } from "@/lib/rpc";
import { pageHidden } from "@/lib/visible";

const REFRESH_MS = 30_000;
const ZERO = BigInt(0);
// exit quotes and fee reads are one call each; keep a refresh bounded
const MAX_QUOTED = 12;
const MAX_LANES = 20;

export type Holding = {
  token: Address;
  name: string;
  symbol: string;
  logo?: string;
  balance: bigint;
  graduated: boolean;
  /** HYPE per token at the pool's price */
  priceEth: number;
  /** what the bag is worth at that price, in HYPE */
  valueEth: number;
  /** what selling it all into the pool would return now, after fees (wei); null when not quoted */
  exitEth: bigint | null;
  /** whether this wallet launched it */
  mine: boolean;
};

export type Portfolio = {
  eth: bigint;
  claimable: bigint;
  holdings: Holding[];
  /** tokens whose creator fees pay this wallet */
  launched: number;
};

/**
 * Everything `wallet` holds on Montra: its HYPE, every Montra token it holds
 * (from Montra's indexer, with the exit value of selling each into its pool
 * quoted on-chain), and the creator fees its pools hold for it. Refreshed
 * every 30 s.
 */
export function usePortfolio(wallet: string | null) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!wallet) return;
    let live = true;
    const account = getAddress(wallet.toLowerCase());
    const t = setTimeout(async () => {
      if (tick > 0 && pageHidden()) return;
      setStatus((s) => (s === "ok" ? s : "loading"));
      try {
        const client = readClient();
        const [eth, held, lanes] = await Promise.all([
          client.getBalance({ address: account }),
          montraApi.holdings(account),
          montraApi.lanes(account).catch(() => ({ tokens: [] })) as Promise<{ tokens?: { address: string }[] }>,
        ]);
        const cards = (held.holdings ?? []).filter((h) => BigInt(h.balance || "0") > ZERO);
        const holdings: Holding[] = cards.map((h) => {
          const balance = BigInt(h.balance);
          const priceEth = Number(h.price) || 0;
          return {
            token: getAddress(h.address),
            name: h.name,
            symbol: h.symbol,
            logo: h.imageUrl ?? undefined,
            balance,
            graduated: h.graduation?.stage === "graduated",
            priceEth,
            valueEth: h.value !== undefined ? Number(h.value) : priceEth * (Number(balance) / 1e18),
            exitEth: null,
            mine: h.creator?.toLowerCase() === account.toLowerCase(),
          };
        });
        holdings.sort((a, b) => b.valueEth - a.valueEth);
        // exact exit value for the largest bags
        await Promise.all(
          holdings.slice(0, MAX_QUOTED).map(async (h) => {
            try {
              h.exitEth = await quote(client, await fetchPool(client, h.token), "sell", h.balance);
            } catch {
              h.exitEth = null;
            }
          }),
        );
        const laneTokens = (lanes.tokens ?? []).slice(0, MAX_LANES);
        const claims = await Promise.all(laneTokens.map((l) => readCreatorToken(client, getAddress(l.address)).then((c) => c.claimable).catch(() => ZERO)));
        if (!live) return;
        setData({ eth, claimable: claims.reduce((s, c) => s + c, ZERO), holdings, launched: (lanes.tokens ?? []).length });
        setStatus("ok");
      } catch {
        if (live) setStatus((s) => (s === "ok" ? s : "error"));
      }
    }, 0);
    const timer = setTimeout(() => setTick((n) => n + 1), REFRESH_MS);
    return () => {
      live = false;
      clearTimeout(t);
      clearTimeout(timer);
    };
  }, [wallet, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { data: wallet ? data : null, status: wallet ? status : "idle", refresh };
}
