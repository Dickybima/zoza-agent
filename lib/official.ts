"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

import { CREATOR_FEE, TAX } from "@/lib/agent";
import type { LaunchedToken } from "@/lib/agent";
import { fetchCurve, fetchTokenInfo } from "@/lib/curve";
import { readClient } from "@/lib/rpc";

// Zoza's own token, pinned at the top of Explore for every visitor.
export const OFFICIAL_ADDRESS: Address = "0x597DAe22ABD24eef9F73E033b37B7a406E7F8ACe";

export type OfficialToken = LaunchedToken & { taxPct: number; creatorPct: number; loaded: boolean };

// shown until the on-chain metadata arrives (or if it can't be read)
const FALLBACK: OfficialToken = {
  name: "Zoza",
  ticker: "ZOZA",
  x: "usezoza",
  website: null,
  logo: "/icon.svg",
  address: OFFICIAL_ADDRESS,
  creator: "",
  tx: "",
  createdAt: 0,
  taxPct: TAX,
  creatorPct: CREATOR_FEE,
  loaded: false,
};

const handleFrom = (url: string) => url.match(/(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i)?.[1] ?? null;
const siteFrom = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "") || null;

/** The official token's card data, read from its on-chain metadata. */
export function useOfficialToken() {
  const [token, setToken] = useState<OfficialToken>(FALLBACK);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const client = readClient();
        const info = await fetchTokenInfo(client, OFFICIAL_ADDRESS);
        const curve = await fetchCurve(client, info.curve).catch(() => null);
        if (!live) return;
        setToken({
          ...FALLBACK,
          name: info.name || FALLBACK.name,
          ticker: info.symbol || FALLBACK.ticker,
          logo: info.logo || FALLBACK.logo,
          x: handleFrom(info.socials.twitter) ?? FALLBACK.x,
          website: siteFrom(info.socials.website),
          curve: info.curve,
          creator: info.deployer,
          taxPct: curve ? Number(curve.feeBps + curve.taxBps) / 100 : TAX,
          creatorPct: curve ? Number(curve.taxBps) / 100 : CREATOR_FEE,
          loaded: true,
        });
      } catch {
        // keep the fallback card; the token page retries on its own
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return token;
}
