// Site navigation: one route per menu item.
export type NavPage = { href: string; label: string; index: string; blurb: string };

export const PAGES: NavPage[] = [
  { href: "/features", label: "Features", index: "01", blurb: "Intelligence at every layer of your launch." },
  { href: "/how-it-works", label: "How it works", index: "02", blurb: "Four commands. One flawless launch." },
  { href: "/agent", label: "Agent", index: "03", blurb: "Converse with Zoza and launch a token." },
  { href: "/explore", label: "Explore", index: "04", blurb: "Every token born through Zoza." },
  { href: "/network", label: "Network", index: "05", blurb: "Built natively on Robinhood Chain." },
  { href: "/tokenize", label: "Tokenize", index: "06", blurb: "Turn a fomo or pump.fun profile into a token." },
];

/** true when `pathname` is `href` or below it (trailing slash tolerant) */
export const isActive = (pathname: string, href: string) =>
  pathname.replace(/\/$/, "") === href || pathname.startsWith(href + "/");
