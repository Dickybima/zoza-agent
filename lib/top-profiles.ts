import type { Platform } from "@/lib/profile";

// Curated list for the Tokenize page. Neither fomo nor pump.fun offers an
// official API to rank profiles, so this is a hand-kept snapshot: update the
// entries (and SNAPSHOT_DATE) to refresh it. Follower counts are as of that date;
// each profile's picture lives in public/profiles/<handle, lowercased>.png.
export const SNAPSHOT_DATE = "Oct 29, 2026";

export type TopProfile = { platform: Platform; name: string; handle: string; followers: number };

export const TOP_PROFILES: TopProfile[] = [
  { platform: "fomo", name: "Unipcs", handle: "unipcs", followers: 823_500 },
  { platform: "fomo", name: "DumbCrayonEater", handle: "DumbCrayonEater", followers: 671_100 },
  { platform: "fomo", name: "PoorGoat", handle: "PoorGoat_", followers: 617_100 },
  { platform: "fomo", name: "point farm capital", handle: "pointfarmcap", followers: 508_500 },
  { platform: "fomo", name: "TheSOLstice", handle: "The__Solstice", followers: 412_500 },
  { platform: "fomo", name: "frank", handle: "frankdegods", followers: 387_000 },
  { platform: "fomo", name: "Avast", handle: "0xAvast", followers: 370_800 },
  { platform: "fomo", name: "TVMX", handle: "tvmx", followers: 356_300 },
  { platform: "fomo", name: "change", handle: "change", followers: 351_400 },
  { platform: "fomo", name: "Ethermonk", handle: "ether_monk", followers: 337_400 },
];

/** The profile picture, saved in public/profiles/ (lowercased handle). */
export const profileAvatar = (p: Pick<TopProfile, "handle">) => `/profiles/${p.handle.toLowerCase()}.png`;

/** The public profile link for a listed profile. */
export const profileUrl = (p: Pick<TopProfile, "platform" | "handle">) =>
  p.platform === "fomo" ? `https://fomo.family/@${p.handle}` : `https://pump.fun/profile/${p.handle}`;
