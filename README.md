# Zoza

Landing page and app for **Zoza**: an AI agent that launches tokens on **Montra**, the launchpad on **Elysium** (Kinetiq's L2 on HyperEVM, HYPE gas).

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
app/<menu>/page.tsx  one route per menu: features, how-it-works, agent, explore, network, tokenize, claim, terminal, portfolio, bridge
lib/montra.ts        Montra: launch, pools, quotes, trades, creator fees, public API (ABIs in lib/montra-abi.ts)
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

## Network and Montra

Zoza runs on **Elysium mainnet** (chain ID 99901) and launches every token on **[Montra](https://montramarkets.xyz)**, Elysium's launchpad (`lib/montra.ts`, docs: montramarkets.xyz/docs/build). One `launch` call to Montra's factory creates the token (1,000,000,000 supply), its Uniswap v4 pool with Montra's hook, and its locked liquidity; there is no bonding curve and nothing migrates. Every trade settles in that pool. Montra's contract addresses are read from its registry, `0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7`; ABIs are Montra's published ones (montramarkets.xyz/docs/abis).

- **Wallets reach Elysium through the Montra RPC**, `https://rpc.montramarkets.xyz`: it reads from Elysium nodes and posts Montra's own transactions (launches, trades, claims, plain HYPE transfers and withdrawals) into Elysium's inbox on HyperEVM, usually landing within 30 seconds. It isn't a general RPC.
- **Fee tier.** Zoza launches at Montra's 3% HYPE tier with no anti-snipe fee: 2.6% of every trade to the creator's wallet and 0.4% to Montra (from Montra's LP line on, part of it goes to liquidity providers).
- **Builder code.** Each launch carries Zoza's Montra builder code (`NEXT_PUBLIC_MONTRA_BUILDER_CODE`, default `zoza`) as an ERC-8021 suffix. Register that code with the wallet that should be paid at montramarkets.xyz/builders/join: Montra's Builders programme then pays it 25% of Montra's protocol fee on every trade in those tokens for 90 days, and Montra's API lists the launches credited to it, which is where Explore's shared list comes from.
- **Metadata.** `api/montra-metadata.mjs` stores a launch's image and metadata document with Montra's API (as Montra's own site does; its upload routes only take browser requests from Montra's origin), and the launch names them; the image also goes into the token's on-chain profile.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_MONTRA_BUILDER_CODE` | Zoza's registered Montra builder code (default `zoza`) |
| `NEXT_PUBLIC_ELYSIUM_RPC` | optional: wallet/read RPC for Elysium (default the Montra RPC) |
| `NEXT_PUBLIC_ELYSIUM_EXPLORER` | optional explorer base URL (default `https://elysium.kinetiq.xyz/explorer`) |
| `NEXT_PUBLIC_ELYSIUM_MAINNET_RPC`, `NEXT_PUBLIC_ELYSIUM_MAINNET_ROLLUP` | optional bridge overrides |
| `ZOZA_RPC_URL` | optional server-side RPC for `api/rpc.js` |

## Agent and on-chain launches

The /agent page uses the MorphOrb component: type into the pill (e.g. `name: Moon Cat ticker: MEOW x: @mooncat website: mooncat.xyz`), the orb thinks, and Zoza's reply unfolds as a card. X and website can be skipped.

Once the blueprint is complete, **Launch** sends a real transaction from the connected wallet: the wallet is switched to Elysium (added with the Montra RPC if missing), Montra's launch terms are read (`launchEnabled`, `launchFee`, the 3% HYPE row from `getConfig`), the metadata is stored, `launch` is simulated and then sent with Zoza's builder suffix for the user to confirm, and `TokenLaunched` gives the token address. The creator is the launching wallet and receives the creator share.

Chain reads go to the Montra RPC (and the wallet's RPC when connected) first; the same-origin proxy `api/rpc.js` is a fallback that joins when the direct sources fail or stay silent for 3 s. Polls skip their reads while the tab is in the background.

### Token logos

Creators upload their own logo in the blueprint panel (button or drag & drop). The browser center-crops it to a square and resizes it to 512×512 WEBP (`lib/upload.ts`), then `api/upload.mjs` checks it is a real PNG/JPG/WEBP/GIF under 1 MB and stores it in **Vercel Blob**, named by its content hash. The returned public URL becomes the token's on-chain `logo`. The logo is optional; tokens without one get a pattern derived from their address.

Uploads need a Blob store connected to the Vercel project: Storage → Create → Blob → connect it to this project, which adds `BLOB_READ_WRITE_TOKEN`; then redeploy. Logos that are `ipfs://` or `ar://` links are opened through public gateways (`lib/logo.ts`).

### Tokenize

`/tokenize` launches a token from a fomo (fomo.family) or pump.fun profile. Neither platform has an official API for reading profiles, so the creator pastes the profile link (`lib/profile.ts` checks the host and path, and prefills the name and ticker from the username) and uploads the picture themselves. The launch goes through the same factory call as the agent; the profile link is stored as the token's on-chain website and in its description, and Explore labels the card with the platform. Profiles aren't verified, and the creator fee goes to the launching wallet.

### Portfolio

`/portfolio` (`lib/portfolio.ts`) shows the connected wallet's HYPE, every Montra token it holds (Montra's API `/api/wallets/{wallet}/holdings`), each valued at its pool's price with the exact "exit" value of selling it all quoted on-chain, and the creator fees its pools hold for it.

### Terminal

`/terminal` swaps Montra tokens from plain-English commands (`lib/terminal.ts` parses them): `swap 1 hype to meow`, `buy meow with 1 hype`, `swap 1m meow to hype`, `sell 50% meow`, `sell all meow`, plus `price`, `balance`, `tokens`, `connect`, `help` and `clear`. Tokens are matched by ticker or name against Zoza's launch list, or by any Montra token's address. Every swap is quoted exactly by Montra's router first (`quoteExactIn`), needs a `y` to go ahead, and runs through `swapExactIn` (approve-then-sell for sells, 5% slippage).

### Claiming creator fees

`/claim` (`lib/fees.ts`) lists the pools whose creator fees pay the connected wallet (Montra's API `/api/wallets/{wallet}/lanes`, this browser's launches, or added by address), with what each would pay now (`LaunchLens.creatorClaimable`). **Claim** calls `claim(poolId, wallet)` on the pool's hook, which only the pool's recipient can do, and pays the wallet in HYPE.

### Token pages and trading

`/token?address=0x…` reads the token's profile from chain and its pool through Montra's lens (`tokenView`: price, fee, buy fee now, graduation progress), and its trades, holders and volume from Montra's indexer; the trades drive the price chart and the transactions table. The trade panel quotes every amount exactly with Montra's router and buys or sells through `swapExactIn` with a slippage bound. Any Montra token can be opened by address, and each page links to the token on Montra.

The Explore feed lists every token launched through Zoza: `api/launches.mjs` reads the launches credited to Zoza's builder code from Montra's API (with each token's details), edge-cached for 60 s, merged with the browser's own launches so a new token appears immediately.

## Bridge (HyperEVM ↔ Elysium)

`/bridge` moves native HYPE between HyperEVM and Elysium (Kinetiq's Arbitrum Orbit L2) through the rollup's canonical bridge, using `@arbitrum/sdk` (`lib/elysium.ts`, `components/site/bridge.tsx`):

- **Deposit** (HyperEVM → Elysium): `Inbox.depositEth`, lands in about a minute.
- **Withdraw** (Elysium → HyperEVM): `ArbSys.withdrawEth`, then **Claim** through `Outbox.executeTransaction` once the challenge period has passed (about a week on mainnet). Transfers are remembered in the browser; "find withdrawals" recovers them from Elysium logs.

Mainnet (HyperEVM 999 ↔ Elysium 99901) bridges through the rollup `0x508c173dfe5f737b3493195bf785d71fa76fd217` (the one Elysium's Inbox `0xce59f8B65ad41C9DAE4c07A0571a39824bD92cff` reports) and sends Elysium-side withdrawals through the Montra RPC; withdrawals take about six days. Testnet (HyperEVM Testnet 998 ↔ Elysium Testnet 99801) is still offered.

Both chain IDs and the rollup's parent chain are checked at runtime before any transaction is offered.
