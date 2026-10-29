"use client";

import { useEffect, useMemo, useState } from "react";

import type { LaunchedToken } from "@/lib/agent";
import { useTokens } from "@/lib/tokens";

const REFRESH_MS = 60_000;

/**
 * Every token launched through Zoza: the on-chain list from api/launches.mjs
 * (shared by every visitor) merged with this browser's own launches, which
 * show up instantly, before the next scan picks them up. Newest first.
 */
export function useAllLaunches() {
  const { tokens: local, fresh } = useTokens();
  const [remote, setRemote] = useState<LaunchedToken[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const r = await fetch("/api/launches");
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as { tokens: LaunchedToken[] };
        if (live) {
          setRemote(Array.isArray(data.tokens) ? data.tokens : []);
          setStatus("ok");
        }
      } catch {
        // e.g. under `next dev`, which doesn't run the Vercel functions
        if (live) setStatus((s) => (s === "ok" ? s : "error"));
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

  const tokens = useMemo(() => {
    const byAddress = new Map<string, LaunchedToken>();
    for (const t of remote) byAddress.set(t.address.toLowerCase(), t);
    // the browser's own record knows a few extras (exact launch time, launch speed)
    for (const t of local) {
      const k = t.address.toLowerCase();
      const r = byAddress.get(k);
      byAddress.set(k, r ? { ...r, ...t, logo: t.logo ?? r.logo, profile: t.profile ?? r.profile } : t);
    }
    return [...byAddress.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [remote, local]);

  return { tokens, fresh, status };
}
