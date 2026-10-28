"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

import { SUPPLY } from "@/lib/agent";
import { DEAD_ADDRESS, fetchBurns, findLaunchBlock, launchedTokenAbi } from "@/lib/curve";
import type { Burn } from "@/lib/curve";
import { readClient } from "@/lib/rpc";

// every launch mints a fixed 1B supply (18 decimals)
const INITIAL_SUPPLY = BigInt(SUPPLY) * BigInt(10) ** BigInt(18);
const POLL_MS = 30_000;

export type BurnStats = {
  status: "loading" | "ok" | "error";
  /** tokens burned so far: sent to the dead address plus any destroyed supply */
  burned: bigint;
  initialSupply: bigint;
  /** most recent burns, newest first (empty until the history is read) */
  burns: Burn[];
  /** whether the burn history could be read at all */
  historyOk: boolean;
  /** bumps whenever a new burn lands while the page is open */
  flare: number;
};

const INITIAL: BurnStats = { status: "loading", burned: BigInt(0), initialSupply: INITIAL_SUPPLY, burns: [], historyOk: false, flare: 0 };

/** Live burn totals for `token`, read on-chain and refreshed every 30 s. */
export function useBurnStats(token: Address) {
  const [stats, setStats] = useState<BurnStats>(INITIAL);

  useEffect(() => {
    const client = readClient();
    const t = { address: token, abi: launchedTokenAbi } as const;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let scanned: bigint | null = null; // last block whose burns are in `history`
    let history: Burn[] = [];
    let historyOk = false;
    let last: bigint | null = null;

    const refresh = async () => {
      try {
        const [supply, dead] = await Promise.all([
          client.readContract({ ...t, functionName: "totalSupply" }),
          client.readContract({ ...t, functionName: "balanceOf", args: [DEAD_ADDRESS] }),
        ]);
        const destroyed = INITIAL_SUPPLY > supply ? INITIAL_SUPPLY - supply : BigInt(0);
        const burned = dead + destroyed;

        // the history is a bonus: the totals above stand on their own
        try {
          const head = await client.getBlockNumber();
          if (scanned === null) {
            const launch = await findLaunchBlock(client, token, head);
            scanned = (launch ?? head) - BigInt(1);
          }
          const fresh = await fetchBurns(client, token, scanned + BigInt(1), head);
          history = [...history, ...fresh].slice(-50);
          scanned = head;
          historyOk = true;
        } catch {
          // keep whatever history was read before
        }

        if (!live) return;
        const grew = last !== null && burned > last;
        last = burned;
        setStats((s) => ({
          status: "ok",
          burned,
          initialSupply: INITIAL_SUPPLY,
          burns: [...history].reverse(),
          historyOk,
          flare: grew ? s.flare + 1 : s.flare,
        }));
      } catch {
        if (live) setStats((s) => (s.status === "ok" ? s : { ...s, status: "error" }));
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

  return stats;
}
