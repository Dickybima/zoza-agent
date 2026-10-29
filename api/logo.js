// Vercel Serverless Function: token logos, fetched server-side and cached at
// the edge. Token artwork comes from Pollinations' free image endpoint, which
// throttles anonymous callers hard (roughly one image per 15 s), so a page of
// Explore cards loading them directly mostly gets refused. Here each image is
// fetched once, retried through the throttle, and then served from Vercel's
// cache for good: a logo URL never changes what it points to.
const ALLOWED_HOSTS = new Set([
  "image.pollinations.ai",
  "ipfs.io",
  "dweb.link",
  "gateway.pinata.cloud",
  "nftstorage.link",
  "arweave.net",
]);
const MAX_BYTES = 5 * 1024 * 1024;
const BUDGET_MS = 50_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  let url;
  try {
    url = new URL(String(req.query.u || ""));
  } catch {
    return res.status(400).json({ error: "bad url" });
  }
  // only known image hosts, so this can't be used as an open proxy
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return res.status(400).json({ error: "host not allowed" });
  }

  const started = Date.now();
  for (let attempt = 0; Date.now() - started < BUDGET_MS - 5_000; attempt++) {
    try {
      const left = BUDGET_MS - (Date.now() - started);
      const r = await fetch(url, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(Math.min(30_000, left)) });
      const type = r.headers.get("content-type") || "";
      if (r.ok && type.startsWith("image/")) {
        const body = Buffer.from(await r.arrayBuffer());
        if (body.length > MAX_BYTES) return res.status(413).json({ error: "image too large" });
        res.setHeader("content-type", type);
        res.setHeader("cache-control", "public, max-age=86400, s-maxage=31536000, immutable");
        return res.status(200).send(body);
      }
      // throttled or still generating: wait and try again; anything else is final
      if (r.status !== 429 && r.status < 500) break;
      const retryAfter = Number(r.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 16_000) : 4_000 + attempt * 2_000);
    } catch {
      await sleep(2_000);
    }
  }
  // a short cache so a broken logo isn't re-fetched by every visitor
  res.setHeader("cache-control", "public, s-maxage=120");
  return res.status(502).json({ error: "logo unavailable" });
};
