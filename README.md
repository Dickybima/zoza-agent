# Zoza

Landing page and demo for **Zoza** — an AI agent that launches tokens on **Robinhood Chain**.

Built with **Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui**, themed as an ASCII terminal around the `VanishRun` tunnel hero (`components/ui/hero-ascii-tunnel.tsx`).

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/
npm run lint
```

`next.config.ts` uses `output: "export"` with `trailingSlash` (each menu page is emitted as `out/<page>/index.html`), so `out/` is a plain static site that deploys as-is to GitHub Pages, Vercel, Netlify, or any static host.

## Project structure

```
app/                 layout (header, footer, fonts, theme script, wallet provider), globals.css, icon.svg
app/page.tsx         home: ASCII tunnel hero, stats, page index, CTA
app/<menu>/page.tsx  one route per menu: features, how-it-works, agent, explore, network, roadmap, faq
components/ui/       shadcn-style primitives, hero-ascii-tunnel.tsx (home hero), ai-thiking-orb-and-input.tsx (agent chat; its mo-* styles live in app/globals.css)
components/site/     page sections (header, hero, agent console, explore, …)
hooks/               small client hooks
lib/agent.ts         prompt parsing, fees, formatting
lib/tokens.tsx       Explore feed store (localStorage in the demo)
lib/wallet.tsx       wallet picker (EIP-6963) + connect() flow
lib/nav.ts           menu pages (header, mobile menu, home index)
brand/               logo and X (Twitter) profile/header images
```

shadcn is configured in `components.json` (aliases `@/components/ui`, `@/lib/utils`). New primitives can be added with `npx shadcn@latest add <component>` and will land in `components/ui/`.

## Agent demo

The /agent page uses the MorphOrb component: type into the pill, the orb thinks, and Zoza's reply unfolds as a card (press Reply to answer). Give Zoza a name, ticker, X account, and website (e.g. `token Liberty ticker LBTY x @liberty web liberty.io`); X and website can be skipped. Every token carries a fixed 3% buy & sell tax: 2% to the creator's wallet, 1% protocol fee. Launches are simulated — no on-chain transactions are sent — and appear in **Explore** automatically.

In production, the Explore feed and stats would be read from the launch contract's events on Robinhood Chain instead of browser storage.
