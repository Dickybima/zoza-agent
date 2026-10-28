// Zoza agent: natural-language parsing for token launches.
// Creators only provide a name, ticker, X account, and website.
// Fixed 3% tax: 2% to the token creator's wallet, 1% protocol fee.

export const CREATOR_FEE = 2;
export const PROTOCOL_FEE = 1;
export const TAX = CREATOR_FEE + PROTOCOL_FEE;
export const SUPPLY = 1_000_000_000;
export const NETWORK = "Robinhood Chain";

export type Field = "name" | "ticker" | "x" | "website";
export const FIELDS: Field[] = ["name", "ticker", "x", "website"];

/** A draft token. `x`/`website` are `null` when the creator skipped them. */
export type Draft = {
  name?: string;
  ticker?: string;
  x?: string | null;
  website?: string | null;
};

export type LaunchedToken = {
  name: string;
  ticker: string;
  x: string | null;
  website: string | null;
  address: string;
  creator: string;
  tx: string;
  createdAt: number;
  launchSeconds?: number;
};

const SKIP = /^(skip|none|n\/a|na|no|not yet|-)$/i;
const X_URL = /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})\/?/i;
const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,]*)?)/i;

export const CONFIRM = /^(yes|y|ok|okay|deploy|launch|confirm|go|let'?s go)$/;
export const CANCEL = /^(cancel|stop|abort)\b/;

const cleanTicker = (v: string) =>
  v.replace(/^\$/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
const cleanX = (v: string) => {
  const m = v.match(X_URL) || v.match(/@?([A-Za-z0-9_]{1,15})$/);
  return m ? m[1] : null;
};
const cleanWeb = (v: string) => {
  const m = v.match(URL_RE);
  return m ? m[1].replace(/^https?:\/\//i, "").replace(/\/$/, "") : null;
};

// Extract fields from free-form text, e.g.
// "create token Liberty ticker LBTY x @liberty web liberty.io"
export function parsePrompt(text: string): Draft {
  const out: Draft = {};
  let t = " " + text.trim() + " ";

  const xm =
    t.match(new RegExp("(?:\\b(?:x|twitter)\\s*:?\\s*)?" + X_URL.source, "i")) ||
    t.match(/\s(?:x|twitter)(?:\s*:\s*|\s+)@?([A-Za-z0-9_]{1,15})\b/i) ||
    t.match(/\s@([A-Za-z0-9_]{1,15})\b/);
  if (xm) {
    out.x = xm[1];
    t = t.replace(xm[0], " ");
  }
  const wm = t.match(/\b(?:website|web|site|url)\s*:?\s*(\S+)/i) || t.match(URL_RE);
  if (wm) {
    const w = cleanWeb(wm[1]);
    if (w) out.website = w;
    t = t.replace(wm[0], " ");
  }
  const tm =
    t.match(/\b(?:ticker|symbol)\s*:?\s*\$?([A-Za-z0-9]{2,10})\b/i) ||
    t.match(/\$([A-Za-z0-9]{2,10})\b/);
  if (tm) {
    out.ticker = cleanTicker(tm[1]);
    t = t.replace(tm[0], " ");
  }
  const nm = t.match(
    /\b(?:token\s+(?:named|called)|named|called|name|token)\s+["“]?([A-Za-z0-9][A-Za-z0-9 \-]{0,30}?)["”]?\s*(?=\s*(?:,|\.|$)|\s+(?:and|with|ticker|symbol|supply|x|twitter|web|website|site|url)\b)/i,
  );
  if (nm) out.name = nm[1].trim();

  // "ZetaCoin ZETA" → name ZetaCoin, ticker ZETA
  if (out.name && !out.ticker) {
    const parts = out.name.split(/\s+/);
    const last = parts[parts.length - 1];
    if (parts.length > 1 && /^[A-Z0-9]{2,10}$/.test(last)) {
      out.ticker = last;
      out.name = parts.slice(0, -1).join(" ");
    }
  }
  return out;
}

// Direct answer to the agent's current question
export function parseAnswer(field: Field, text: string): Draft {
  const v = text.trim();
  if ((field === "x" || field === "website") && SKIP.test(v)) return { [field]: null };
  if (field === "name") return v.length <= 32 ? { name: v.replace(/^["“]|["”]$/g, "") } : {};
  if (field === "ticker") {
    const tk = cleanTicker(v);
    return tk.length >= 2 ? { ticker: tk } : {};
  }
  if (field === "x") {
    const x = cleanX(v);
    return x ? { x } : {};
  }
  const w = cleanWeb(v);
  return w ? { website: w } : {};
}

export const nextMissing = (d: Draft) => FIELDS.find((f) => !(f in d));

export const shortAddr = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
export const randHex = (n: number) =>
  Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
export const fmt = (n: number) => n.toLocaleString("en-US");

export function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s >= 86400) return Math.floor(s / 86400) + "d ago";
  if (s >= 3600) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 60) + "m ago";
}
