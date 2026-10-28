"use client";

import { useSyncExternalStore } from "react";

import type { LaunchedToken } from "@/lib/agent";

// Every token launched through the agent is published to Explore. The feed
// lives in this browser's localStorage (with an in-memory fallback); a feed
// shared by every visitor would index the launch factory's TokenLaunched
// events on Robinhood Chain. Bumping the version starts every browser with
// an empty list (v1: simulated launches, v2: list cleared on request).
const STORE_KEY = "zoza.tokens.v3";
const OLD_KEYS = ["zoza.tokens.v1", "zoza.tokens.v2"];
const EMPTY: LaunchedToken[] = [];

// drop earlier lists so they don't linger in storage
try {
  if (typeof localStorage !== "undefined") OLD_KEYS.forEach((k) => localStorage.removeItem(k));
} catch {}

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
