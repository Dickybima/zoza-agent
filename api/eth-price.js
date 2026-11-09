// Vercel Serverless Function: HYPE/USD spot price for showing token prices in
// USD (Zoza runs on Elysium, where HYPE is the gas and quote currency). Tries
// a few public price APIs in order and lets Vercel's edge cache the answer for
// a minute, so visitors never hit the upstream APIs directly. (The path keeps
// its old name so cached clients keep working.)
const SOURCES = [
  [
    "hyperliquid",
    "https://api.hyperliquid.xyz/info",
    (j) => j.HYPE,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "allMids" }) },
  ],
  ["coingecko", "https://api.coingecko.com/api/v3/simple/price?ids=hyperliquid&vs_currencies=usd", (j) => j.hyperliquid.usd],
  ["kraken", "https://api.kraken.com/0/public/Ticker?pair=HYPEUSD", (j) => Object.values(j.result)[0].c[0]],
];

module.exports = async function handler(req, res) {
  for (const [source, url, pick, init] of SOURCES) {
    try {
      const r = await fetch(url, { ...init, headers: { accept: "application/json", ...init?.headers }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const usd = Number(pick(await r.json()));
      if (Number.isFinite(usd) && usd > 0) {
        res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
        return res.status(200).json({ usd, source, symbol: "HYPE" });
      }
    } catch {
      // try the next source
    }
  }
  res.setHeader("cache-control", "no-store");
  return res.status(502).json({ error: "HYPE price unavailable" });
};
