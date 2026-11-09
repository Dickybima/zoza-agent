// Command parser for the Zoza terminal. Swaps go through a token's bonding
// curve, so one side of every swap is HYPE:
//   swap 1 hype to test      buy 1 hype of test      buy test with 1 hype
//   swap 1m test to hype        sell 50% test             sell all $test
// plus price, balance, tokens, connect, help and clear.

export type Amount = { type: "abs"; value: string } | { type: "pct"; pct: number };

export type Command =
  | { kind: "help" }
  | { kind: "clear" }
  | { kind: "tokens" }
  | { kind: "connect" }
  | { kind: "balance"; token: string | null }
  | { kind: "price"; token: string }
  | { kind: "buy"; token: string; eth: string }
  | { kind: "sell"; token: string; amount: Amount }
  | { kind: "error"; message: string };

const NUM = String.raw`(\d+(?:[.,]\d+)?|\.\d+)\s*([kmb])?`;
const ETH = String.raw`(?:hype|eth)`; // "eth" kept as a habit-friendly alias
const TOKEN = String.raw`(\$?[a-z0-9]{1,16}|0x[a-f0-9]{40})`;
const TO = String.raw`(?:to|for|into|->|→|=>)`;

/** "1.5k" → "1500"; keeps decimals for parseEther / parseUnits. */
export function expandNumber(n: string, suffix?: string): string {
  const base = n.replace(",", ".");
  if (!suffix) return base;
  const mult = { k: 3, m: 6, b: 9 }[suffix.toLowerCase() as "k" | "m" | "b"];
  const [int, frac = ""] = base.split(".");
  const digits = (int + frac.padEnd(mult, "0")).replace(/^0+(?=\d)/, "");
  const cut = frac.length > mult ? `${digits.slice(0, digits.length - (frac.length - mult))}.${frac.slice(mult)}` : digits;
  return cut.startsWith(".") ? `0${cut}` : cut;
}

const cleanToken = (t: string) => t.replace(/^\$/, "").toLowerCase();

function parseAmount(raw: string): Amount | null {
  const s = raw.trim().toLowerCase();
  if (s === "all" || s === "max" || s === "everything") return { type: "pct", pct: 100 };
  if (s === "half") return { type: "pct", pct: 50 };
  const pct = s.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) {
    const p = Number(pct[1]);
    return p > 0 && p <= 100 ? { type: "pct", pct: p } : null;
  }
  const n = s.match(new RegExp(`^${NUM}$`, "i"));
  return n ? { type: "abs", value: expandNumber(n[1], n[2]) } : null;
}

export function parseCommand(input: string): Command {
  const s = input.trim().replace(/\s+/g, " ").toLowerCase().replace(/^(please |pls |zoza,? )/, "");
  if (!s) return { kind: "error", message: "" };
  if (/^(help|\?|commands|menu)$/.test(s)) return { kind: "help" };
  if (/^(clear|cls|reset)$/.test(s)) return { kind: "clear" };
  if (/^(tokens|ls|list|markets?)$/.test(s)) return { kind: "tokens" };
  if (/^(connect|login|wallet)$/.test(s)) return { kind: "connect" };

  let m = s.match(new RegExp(`^(?:balance|bal|holdings|portfolio)(?: (?:of )?${TOKEN})?$`));
  if (m) return { kind: "balance", token: m[1] ? cleanToken(m[1]) : null };
  m = s.match(new RegExp(`^(?:price|chart|info)(?: of)? ${TOKEN}$`));
  if (m) return { kind: "price", token: cleanToken(m[1]) };

  // HYPE → token
  m =
    s.match(new RegExp(`^(?:swap|trade|convert|buy|ape) ${NUM} ?${ETH} (?:${TO}|of|worth of|in) ${TOKEN}$`)) ??
    s.match(new RegExp(`^(?:buy|ape) ${NUM} ?${ETH} ${TOKEN}$`));
  if (m && /^(hype|eth)$/.test(cleanToken(m[3]))) return { kind: "error", message: "That’s HYPE to HYPE. Name a token, e.g. swap 1 hype to test." };
  if (m) return { kind: "buy", token: cleanToken(m[3]), eth: expandNumber(m[1], m[2]) };
  m = s.match(new RegExp(`^(?:buy|ape(?: into)?) ${TOKEN} (?:with|for|using) ${NUM} ?${ETH}$`));
  if (m) return { kind: "buy", token: cleanToken(m[1]), eth: expandNumber(m[2], m[3]) };

  // token → HYPE
  m = s.match(new RegExp(`^(?:swap|trade|convert|sell|dump) (.+?) ${TOKEN}(?: (?:${TO}) ${ETH})?$`));
  if (m && !new RegExp(`^${ETH}$`).test(m[2])) {
    const amount = parseAmount(m[1]);
    if (amount && (/^(sell|dump)/.test(s) || new RegExp(`${TO} ${ETH}$`).test(s))) return { kind: "sell", token: cleanToken(m[2]), amount };
  }
  m = s.match(new RegExp(`^(?:sell|dump) ${TOKEN}$`));
  if (m) return { kind: "sell", token: cleanToken(m[1]), amount: { type: "pct", pct: 100 } };

  if (/^(buy|swap|trade|ape)\b/.test(s) && !new RegExp(ETH).test(s)) {
    return { kind: "error", message: "Say how much HYPE to spend, e.g. swap 1 hype to test." };
  }
  if (/^(sell|dump)\b/.test(s)) return { kind: "error", message: "Say how much to sell, e.g. sell 50% zoza or sell 1m zoza." };
  return { kind: "error", message: `Unknown command. Type help to see what I can do.` };
}

/** Commands shown as clickable examples. */
export const EXAMPLES = ["swap 1 hype to test", "sell 50% test", "price test", "balance", "tokens", "help"];
