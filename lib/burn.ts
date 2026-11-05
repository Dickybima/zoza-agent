"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Address } from "viem";

import { SUPPLY } from "@/lib/agent";
import { DEAD_ADDRESS, fetchBurns, findLaunchBlock, launchedTokenAbi } from "@/lib/curve";
import type { Burn } from "@/lib/curve";
import { readClient } from "@/lib/rpc";
import { pageHidden } from "@/lib/visible";

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

// One poller per token, shared by every component that shows its burns (the
// ticker and the burn tracker on the home page would otherwise read it twice).
type Shared = { stats: BurnStats; listeners: Set<() => void>; stop?: () => void };
const shared = new Map<string, Shared>();

function poller(token: Address, entry: Shared) {
  const setStats = (next: (s: BurnStats) => BurnStats) => {
    entry.stats = next(entry.stats);
    entry.listeners.forEach((l) => l());
  };
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
      // nobody is looking: skip this round (the first read always runs)
      if (last !== null && pageHidden()) return;
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
}

/** Live burn totals for `token`, read on-chain and refreshed every 30 s. */
export function useBurnStats(token: Address) {
  const key = token.toLowerCase();
  const subscribe = useCallback(
    (cb: () => void) => {
      let entry = shared.get(key);
      if (!entry) shared.set(key, (entry = { stats: INITIAL, listeners: new Set() }));
      entry.listeners.add(cb);
      entry.stop ??= poller(token, entry);
      return () => {
        entry.listeners.delete(cb);
        if (!entry.listeners.size) {
          entry.stop?.();
          entry.stop = undefined;
        }
      };
    },
    [key, token],
  );
  return useSyncExternalStore(subscribe, () => shared.get(key)?.stats ?? INITIAL, () => INITIAL);
}
