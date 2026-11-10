"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

import type { LaunchedToken } from "@/lib/agent";
import { montraApi } from "@/lib/montra";
import { pageHidden } from "@/lib/visible";

// Zoza's own token on Montra (Elysium), pinned at the top of Explore. Its
// on-chain ticker is Z0ZA, with a zero.
export const OFFICIAL_ADDRESS: Address = "0xbdfe025d56d00712c8152fdd24377aacb77cae4f";

export type OfficialToken = LaunchedToken & {
  /** market cap in HYPE */
  marketCap: number | null;
  holders: number | null;
  /** total trade fee, percent */
  feePct: number | null;
  loaded: boolean;
};

// shown until Montra's API answers (or if it can't)
const FALLBACK: OfficialToken = {
  name: "Zoza",
  ticker: "Z0ZA",
  x: "usezoza",
  website: "usezoza.app",
  logo: "/icon.svg",
  address: OFFICIAL_ADDRESS,
  creator: "0xde452f2eb5fd54d821fc831a29818f9315424947",
  tx: "",
  createdAt: 1794331045000,
  marketCap: null,
  holders: null,
  feePct: null,
  loaded: false,
};

const REFRESH_MS = 60_000;

/** The official token's card, read from Montra's indexer and refreshed every minute. */
export function useOfficialToken(): OfficialToken {
  const [token, setToken] = useState<OfficialToken>(FALLBACK);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        if (!pageHidden()) {
          const c = await montraApi.token(OFFICIAL_ADDRESS);
          if (live) {
            setToken({
              ...FALLBACK,
              name: c.name || FALLBACK.name,
              ticker: c.symbol || FALLBACK.ticker,
              logo: c.imageUrl || FALLBACK.logo,
              creator: c.creator || FALLBACK.creator,
              createdAt: c.launchedAt || FALLBACK.createdAt,
              marketCap: Number(c.marketCap) || null,
              holders: typeof c.holders === "number" ? c.holders : null,
              feePct: typeof c.totalFeePips === "number" ? c.totalFeePips / 10_000 : null,
              loaded: true,
            });
          }
        }
      } catch {
        // keep the last reading
      } finally {
        if (live) timer = setTimeout(load, REFRESH_MS);
      }
    };
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);
  return token;
}
