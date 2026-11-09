// Vercel Serverless Function: every token launched through Zoza on Montra.
// Zoza's launches carry its Montra builder code (an ERC-8021 suffix on the
// launch transaction), and Montra's indexer lists the launches credited to a
// code at /api/builders/{code}/launches once the code is registered at
// montramarkets.xyz/builders/join. Each launch is then read in full from
// Montra's API (creator, description, links). Cached at the edge for a minute.
// Until the code is registered, this answers an empty list and Explore shows
// the launches made in the visitor's own browser.
const API = "https://api.montramarkets.xyz";
const CODE = (process.env.NEXT_PUBLIC_MONTRA_BUILDER_CODE || "zoza").toLowerCase();
const MAX_TOKENS = 60;

async function get(path) {
  const r = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Montra API ${r.status}`);
  return r.json();
}

async function inBatches(items, n, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

const handleFrom = (url) => (url || "").match(/(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i)?.[1] ?? null;
const siteFrom = (url) => (url || "").replace(/^https?:\/\//i, "").replace(/\/$/, "") || null;

function profileFrom(description, website) {
  const m = (description || "").match(/a tokenized (fomo|pump\.fun) profile: (https:\/\/\S+?)\.?(\s|$)/i);
  if (!m) return undefined;
  return { platform: m[1].toLowerCase() === "fomo" ? "fomo" : "pumpfun", url: m[2] || `https://${website}`, ...(/unofficial:/i.test(description) ? { unofficial: true } : {}) };
}

export default async function handler(req, res) {
  try {
    const credited = await get(`/api/builders/${encodeURIComponent(CODE)}/launches?limit=${MAX_TOKENS}`);
    if (!credited) {
      res.setHeader("cache-control", "public, s-maxage=60");
      return res.status(200).json({ code: CODE, registered: false, tokens: [] });
    }
    const tokens = await inBatches(credited.launches || [], 6, async (l) => {
      try {
        const t = await get(`/api/tokens/${l.token}`);
        if (!t) return null;
        const meta = t.metadata || {};
        const twitter = meta.twitter || "";
        const website = siteFrom(meta.website || "");
        return {
          name: t.name,
          ticker: t.symbol,
          x: handleFrom(twitter),
          website,
          address: t.address,
          logo: t.imageUrl || undefined,
          block: t.launchBlock ?? undefined,
          creator: t.creator,
          tx: l.txHash || t.launchTx || "",
          createdAt: t.launchedAt || l.launchedAt || 0,
          profile: profileFrom(t.description || meta.description, website),
        };
      } catch {
        return null;
      }
    });
    res.setHeader("cache-control", "public, s-maxage=60, stale-while-revalidate=600");
    return res.status(200).json({ code: CODE, registered: true, tokens: tokens.filter(Boolean) });
  } catch {
    res.setHeader("cache-control", "no-store");
    return res.status(502).json({ error: "Montra did not respond." });
  }
}
