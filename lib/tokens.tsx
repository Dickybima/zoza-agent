"use client";

import { useSyncExternalStore } from "react";

import type { LaunchedToken } from "@/lib/agent";

// Every token launched through the agent is published to Explore.
// The demo keeps the feed in localStorage (with an in-memory fallback);
// in production this would be read from the launch contract's events on
// Robinhood Chain.
const STORE_KEY = "zoza.tokens.v1";
const EMPTY: LaunchedToken[] = [];

let memory = "[]";
let cachedRaw: string | null = null;
let cached: LaunchedToken[] = EMPTY;
let fresh: string | null = null;
const listeners = new Set<() => void>();

function readRaw() {
  try {
    return localStorage.getItem(STORE_KEY) ?? memory;
  } catch {
    return memory;
  }
}

function getSnapshot() {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const list = JSON.parse(raw);
      cached = Array.isArray(list) ? list : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // keep other open tabs in sync
  const onStorage = (e: StorageEvent) => e.key === STORE_KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function publishToken(t: LaunchedToken) {
  const raw = JSON.stringify([...getSnapshot(), t]);
  memory = raw;
  try {
    localStorage.setItem(STORE_KEY, raw);
  } catch {}
  fresh = t.address;
  listeners.forEach((l) => l());
}

export function useTokens() {
  const tokens = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  return { tokens, fresh, publish: publishToken };
}
