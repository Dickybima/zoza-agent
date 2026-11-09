// Token pages and trading on Montra pools: on-chain reads (lib/montra.ts) plus
// the trade history Montra's indexer serves (api.montramarkets.xyz), which
// drives the token page's chart and transaction list.
import type { Address, Hash } from "viem";

import { montraApi } from "@/lib/montra";

export type Trade = {
  kind: "buy" | "sell";
  trader: Address;
  /** HYPE paid (buy, fee included) or received (sell, after the fee), in wei */
  eth: bigint;
  tokens: bigint;
  /** HYPE per token: the pool's price after this trade */
  price: number;
  tx: Hash;
  id: number;
  /** unix seconds */
  time: number;
};

/** A token's latest trades from Montra's indexer, oldest first. */
export async function fetchTrades(token: Address, limit = 200): Promise<Trade[]> {
  const { trades } = await montraApi.trades(token, limit);
  return trades
    .map((t) => ({
      kind: t.isBuy ? ("buy" as const) : ("sell" as const),
      trader: t.sender,
      eth: BigInt(t.quoteAmount),
      tokens: BigInt(t.tokenAmount),
      price: Number(t.price),
      tx: t.txHash,
      id: t.id,
      time: Math.floor(t.t / 1000),
    }))
    .reverse();
}
