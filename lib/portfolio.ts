"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, getAddress } from "viem";
import type { Address } from "viem";

import { fetchCurve, launchedTokenAbi, quoteSell, spotPrice } from "@/lib/curve";
import type { CurveState } from "@/lib/curve";
import { claimableBalance, feeEscrowAddress } from "@/lib/fees";
import { useAllLaunches } from "@/lib/launches";
import { OFFICIAL_ADDRESS } from "@/lib/official";
import { readClient } from "@/lib/rpc";
import { pageHidden } from "@/lib/visible";

const REFRESH_MS = 30_000;
const BATCH = 8;
const ZERO = BigInt(0);

export type Holding = {
  token: Address;
  name: string;
  symbol: string;
  logo?: string;
  balance: bigint;
  curve: Address;
  state: CurveState | null;
  /** ETH per token at the curve's spot price */
  priceEth: number;
  /** what the bag is worth at spot, in ETH */
  valueEth: number;
  /** what selling it all into the curve would return now, after fees (wei) */
  exitEth: bigint;
  /** whether this wallet launched it */
  mine: boolean;
};

export type Portfolio = {
  eth: bigint;
  claimable: bigint;
  holdings: Holding[];
  /** Zoza tokens this wallet launched */
  launched: number;
};

async function inBatches<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(...(await Promise.all(items.slice(i, i + BATCH).map(fn))));
  return out;
}

/**
 * Everything `wallet` holds across Zoza: its ETH, its balance of every token
 * launched through Zoza (valued from each bonding curve), and its claimable
 * creator fees. Read on-chain and refreshed every 30 s.
 */
export function usePortfolio(wallet: string | null) {
  const { tokens } = useAllLaunches();
  const [data, setData] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [tick, setTick] = useState(0);

  // every Zoza token, the official one first
  const list = useMemo(() => {
    const seen = new Set<string>([OFFICIAL_ADDRESS.toLowerCase()]);
    const rest = tokens.filter((t) => !seen.has(t.address.toLowerCase()) && seen.add(t.address.toLowerCase()));
    return [{ address: OFFICIAL_ADDRESS as string, name: "Zoza", ticker: "ZOZA", curve: undefined as string | undefined, logo: "/icon.svg", creator: "" }, ...rest];
  }, [tokens]);
  const listKey = list.map((t) => t.address).join(",");

  useEffect(() => {
    if (!wallet) return;
    let live = true;
    const account = getAddress(wallet.toLowerCase());
    const t = setTimeout(async () => {
      if (tick > 0 && pageHidden()) return;
      setStatus((s) => (s === "ok" ? s : "loading"));
      try {
        const client = readClient();
        const [eth, claimable, balances] = await Promise.all([
          client.getBalance({ address: account }),
          feeEscrowAddress(client)
            .then((escrow) => claimableBalance(client, escrow, account))
            .catch(() => ZERO),
          inBatches(list, (tok) =>
            client
              .readContract({ address: tok.address as Address, abi: launchedTokenAbi, functionName: "balanceOf", args: [account] })
              .catch(() => ZERO),
          ),
        ]);
        const held = list.map((tok, i) => ({ tok, balance: balances[i] })).filter((h) => h.balance > ZERO);
        const holdings = await inBatches(held, async ({ tok, balance }): Promise<Holding> => {
          const address = tok.address as Address;
          const [curve, name, symbol] = await Promise.all([
            tok.curve ? Promise.resolve(tok.curve as Address) : client.readContract({ address, abi: launchedTokenAbi, functionName: "curve" }),
            client.readContract({ address, abi: launchedTokenAbi, functionName: "name" }).catch(() => tok.name),
            client.readContract({ address, abi: launchedTokenAbi, functionName: "symbol" }).catch(() => tok.ticker),
          ]);
          const state = await fetchCurve(client, curve).catch(() => null);
          const priceEth = state && !state.graduated ? spotPrice(state) : 0;
          return {
            token: address,
            name,
            symbol,
            logo: tok.logo,
            balance,
            curve,
            state,
            priceEth,
            valueEth: priceEth * Number(formatEther(balance)),
            exitEth: state && !state.graduated ? quoteSell(state, balance) : ZERO,
            mine: tok.creator.toLowerCase() === account.toLowerCase(),
          };
        });
        if (!live) return;
        holdings.sort((a, b) => b.valueEth - a.valueEth || (b.balance > a.balance ? 1 : -1));
        setData({ eth, claimable, holdings, launched: list.filter((tok) => tok.creator.toLowerCase() === account.toLowerCase()).length });
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
    // listKey stands in for list; tick re-runs the read on a timer or a manual refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, listKey, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { data: wallet ? data : null, status: wallet ? status : "idle", refresh };
}
