// Where to load a token's logo from, best first. Logos are images the creator
// uploaded (Vercel Blob URLs) and load as they are; ipfs:// and ar:// links
// are opened through public gateways (filebase first: Montra's docs note that
// ipfs.io and dweb.link refuse most requests).
export function logoSources(src: string | null | undefined): string[] {
  const raw = src?.trim();
  if (!raw) return [];
  if (raw.startsWith("ipfs://")) {
    const path = raw.slice("ipfs://".length).replace(/^ipfs\//, "");
    return [`https://ipfs.filebase.io/ipfs/${path}`, `https://ipfs.io/ipfs/${path}`];
  }
  if (raw.startsWith("ar://")) return [`https://arweave.net/${raw.slice("ar://".length)}`];
  return [raw];
}
