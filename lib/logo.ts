// Where to load a token's logo from, best first. Pollinations artwork goes
// through Zoza's caching proxy (api/logo.js), then directly as a fallback
// (e.g. under `next dev`, which doesn't run the Vercel functions); ipfs://
// links are opened through public gateways.
const PROXIED = new Set(["image.pollinations.ai", "ipfs.io", "dweb.link", "gateway.pinata.cloud", "nftstorage.link", "arweave.net"]);

export function logoSources(src: string | null | undefined): string[] {
  const raw = src?.trim();
  if (!raw) return [];
  if (raw.startsWith("ipfs://")) {
    const path = raw.slice("ipfs://".length).replace(/^ipfs\//, "");
    return [`https://ipfs.io/ipfs/${path}`, `https://dweb.link/ipfs/${path}`].flatMap(viaProxy);
  }
  if (raw.startsWith("ar://")) return viaProxy(`https://arweave.net/${raw.slice("ar://".length)}`);
  return viaProxy(raw);
}

function viaProxy(url: string): string[] {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && PROXIED.has(u.hostname)) return [`/api/logo?u=${encodeURIComponent(url)}`, url];
  } catch {
    // a relative path such as /icon.svg
  }
  return [url];
}
