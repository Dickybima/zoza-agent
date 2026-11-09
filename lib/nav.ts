// Site navigation: one route per menu item.
export type NavPage = { href: string; label: string; index: string; blurb: string };

export const PAGES: NavPage[] = [
  { href: "/features", label: "Features", index: "01", blurb: "Intelligence at every layer of your launch." },
  { href: "/how-it-works", label: "How it works", index: "02", blurb: "Four commands. One flawless launch." },
  { href: "/agent", label: "Agent", index: "03", blurb: "Converse with Zoza and launch a token." },
  { href: "/explore", label: "Explore", index: "04", blurb: "Every token born through Zoza." },
  { href: "/network", label: "Network", index: "05", blurb: "Built natively on Elysium." },
  { href: "/tokenize", label: "Tokenize", index: "06", blurb: "Turn a fomo or pump.fun profile into a token." },
  { href: "/terminal", label: "Terminal", index: "07", blurb: "Swap any Zoza token by just saying it." },
  { href: "/portfolio", label: "Portfolio", index: "08", blurb: "Everything your wallet holds across Zoza." },
  { href: "/bridge", label: "Bridge", index: "09", blurb: "Move HYPE between HyperEVM and Elysium." },
];

/** true when `pathname` is `href` or below it (trailing slash tolerant) */
export const isActive = (pathname: string, href: string) =>
  pathname.replace(/\/$/, "") === href || pathname.startsWith(href + "/");
