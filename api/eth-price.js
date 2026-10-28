// Vercel Serverless Function: ETH/USD spot price for showing token prices in
// USD. Tries a few public price APIs in order and lets Vercel's edge cache the
// answer for a minute, so visitors never hit the upstream APIs directly.
const SOURCES = [
  ["coinbase", "https://api.coinbase.com/v2/prices/ETH-USD/spot", (j) => j.data.amount],
  ["coingecko", "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", (j) => j.ethereum.usd],
  ["kraken", "https://api.kraken.com/0/public/Ticker?pair=ETHUSD", (j) => Object.values(j.result)[0].c[0]],
];

module.exports = async function handler(req, res) {
  for (const [source, url, pick] of SOURCES) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const usd = Number(pick(await r.json()));
      if (Number.isFinite(usd) && usd > 0) {
        res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
        return res.status(200).json({ usd, source });
      }
    } catch {
      // try the next source
    }
  }
  res.setHeader("cache-control", "no-store");
  return res.status(502).json({ error: "ETH price unavailable" });
};
