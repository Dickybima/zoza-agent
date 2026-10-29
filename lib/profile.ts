// Profile links for the Tokenize page. A profile is identified by its public
// link alone (neither platform offers an official API to read profiles from);
// the creator names the token and uploads its picture themselves.
export type Platform = "fomo" | "pumpfun";

export const PLATFORMS: Record<Platform, { label: string; hosts: string[]; example: string; hint: string }> = {
  fomo: {
    label: "fomo",
    hosts: ["fomo.family", "www.fomo.family", "app.fomo.family"],
    example: "https://fomo.family/@username",
    hint: "the link to a profile on fomo.family",
  },
  pumpfun: {
    label: "pump.fun",
    hosts: ["pump.fun", "www.pump.fun"],
    example: "https://pump.fun/profile/username",
    hint: "a pump.fun/profile/… link",
  },
};

// the launch factory caps every social link at 256 bytes
const MAX_LINK = 256;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type ParsedProfile = { url: string; handle: string | null };

/** Validates a pasted profile link; returns the clean link and the profile's handle if it has one. */
export function parseProfile(platform: Platform, input: string): ParsedProfile | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: "" };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { error: `Paste ${PLATFORMS[platform].hint}.` };
  }
  const p = PLATFORMS[platform];
  if (!p.hosts.includes(u.hostname.toLowerCase())) return { error: `That isn’t a ${p.label} link. Paste ${p.hint}.` };
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (platform === "pumpfun" && (parts[0] !== "profile" || !parts[1])) return { error: `Paste ${p.hint}.` };
  if (!parts.length) return { error: `That’s the ${p.label} home page. Paste a profile link.` };

  const id = platform === "pumpfun" ? parts[1] : parts[parts.length - 1];
  const url = `https://${u.hostname.toLowerCase()}/${parts.map(encodeURIComponent).join("/").replace(/%40/g, "@")}`;
  if (url.length > MAX_LINK) return { error: "That link is too long to store on-chain." };
  // wallet addresses make poor token names, so only usernames prefill the form
  const handle = id.replace(/^@/, "");
  return { url, handle: handle && !SOLANA_ADDRESS.test(handle) ? handle : null };
}

/** A ticker suggestion from a handle: up to 10 letters and digits. */
export const tickerFrom = (handle: string) => {
  const t = handle.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return t.length >= 2 ? t : "";
};
