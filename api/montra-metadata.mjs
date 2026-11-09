// Vercel Serverless Function: stores a launch's image and metadata document
// with Montra's API (POST /api/metadata/image, then POST /api/metadata), the
// way Montra's own site does, and answers their URIs for the launch. Montra's
// API only takes these uploads from its own origin in a browser, so Zoza's
// launch flow sends them through here. Montra pins both to IPFS once the
// launch is seen. The image must be one of Zoza's own uploads (Vercel Blob).
const API = "https://api.montramarkets.xyz";
const MAX_IMAGE = 2 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function posted(r) {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Montra API ${r.status}`);
  return body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  let body = req.body;
  try {
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    return res.status(400).json({ error: "Bad JSON" });
  }
  const name = str(body?.name, 64);
  const symbol = str(body?.symbol, 16);
  if (!name || !symbol) return res.status(400).json({ error: "name and symbol are required" });

  try {
    let image;
    if (body.image) {
      const url = new URL(String(body.image));
      if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")) {
        return res.status(400).json({ error: "image must be a Zoza upload" });
      }
      const got = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const type = (got.headers.get("content-type") || "").split(";")[0];
      if (!got.ok || !TYPES.has(type)) return res.status(400).json({ error: "image could not be read" });
      const bytes = Buffer.from(await got.arrayBuffer());
      if (bytes.length > MAX_IMAGE) return res.status(400).json({ error: "image is over 2 MB" });
      image = (await posted(await fetch(`${API}/api/metadata/image`, { method: "POST", headers: { "content-type": type }, body: bytes, signal: AbortSignal.timeout(20_000) }))).uri;
    }
    const doc = { name, symbol, description: str(body.description, 1000) };
    if (image) doc.image = image;
    for (const k of ["website", "twitter"]) {
      const v = str(body[k], 256);
      if (/^https:\/\//.test(v)) doc[k] = v;
    }
    const meta = await posted(await fetch(`${API}/api/metadata`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(doc), signal: AbortSignal.timeout(20_000) }));
    res.setHeader("cache-control", "no-store");
    return res.status(200).json({ uri: meta.uri, image: image ?? null });
  } catch (err) {
    res.setHeader("cache-control", "no-store");
    return res.status(502).json({ error: err instanceof Error ? err.message : "Montra API unavailable" });
  }
}
