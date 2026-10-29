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
app/<menu>/page.tsx  one route per menu: features, how-it-works, agent, explore, network, tokenize, claim
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

## Agent and on-chain launches

The /agent page uses the MorphOrb component: type into the pill (e.g. `name: Moon Cat ticker: MEOW x: @mooncat website: mooncat.xyz`), the orb thinks, and Zoza's reply unfolds as a card. X and website can be skipped.

Once the blueprint is complete, **Launch** sends a real transaction from the connected wallet:

1. the wallet is switched to **Robinhood Chain** (chain ID 4663, added if missing);
2. launch terms are read from the Pons V2 launch factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` (`canLaunch`, `launchFee`, `maxCreatorTaxBps`, the first enabled launch config, and `previewLaunchEconomics` to pin the quoted terms);
3. `launchToken` is simulated, then sent for the user to confirm in their wallet, paying `launchFee` — the creator tax is 2% (`creatorTaxBps = 200`) paid to the creator's wallet;
4. the `TokenLaunched` event gives the token address, the token is added to **Explore** and the user is taken there.

Chain reads race three sources and take the first answer: the same-origin proxy `api/rpc.js` (a Vercel Serverless Function forwarding read-only JSON-RPC methods to `rpc.mainnet.chain.robinhood.com`, so browsers are not blocked by CORS or the wallet's RPC), the public RPC directly, and the wallet's RPC.

See `lib/launchpad.ts` (factory ABI, source: github.com/Minh3132/pons-labs `contractsV2/src/v2/PonsV2LaunchFactory.sol`) and `lib/chain.ts` (RPC, explorer). Verify the factory address on the explorer before relying on it.

### Token logos

Creators upload their own logo in the blueprint panel (button or drag & drop). The browser center-crops it to a square and resizes it to 512×512 WEBP (`lib/upload.ts`), then `api/upload.mjs` checks it is a real PNG/JPG/WEBP/GIF under 1 MB and stores it in **Vercel Blob**, named by its content hash. The returned public URL becomes the token's on-chain `logo` (the launch factory caps that field at 512 bytes, so the image itself can't go on-chain). The logo is optional; tokens without one get a pattern derived from their address.

Uploads need a Blob store connected to the Vercel project: Storage → Create → Blob → connect it to this project, which adds `BLOB_READ_WRITE_TOKEN`; then redeploy. Without it, uploading shows "Logo uploads aren't set up on this site yet." Logos that are `ipfs://` or `ar://` links (from tokens launched elsewhere) are opened through public gateways (`lib/logo.ts`).

### Tokenize

`/tokenize` launches a token from a fomo (fomo.family) or pump.fun profile. Neither platform has an official API for reading profiles, so the creator pastes the profile link (`lib/profile.ts` checks the host and path, and prefills the name and ticker from the username) and uploads the picture themselves. The launch goes through the same factory call as the agent; the profile link is stored as the token's on-chain website and in its description (social links are capped at 256 bytes), and Explore labels the card with the platform. Profiles aren't verified, and the creator fee goes to the launching wallet.

### Claiming creator fees

`/claim` (`lib/fees.ts`) shows a creator's fees. Each trade books the creator tax, plus the creator's share of the base fee, on the token's bonding curve; the creator can call the curve's `sweepFees(0)` to move it into the launchpad's shared fee escrow (`factory.feeEscrow()`), which works while no buyback is pending (Zoza launches have buyback off). Graduated pools pay into the same escrow. `claim()` on the escrow sends the wallet's whole ETH balance to it. The page lists the wallet's launches (from this browser, from `TokenLaunched` events filtered by deployer, or added by address), with a Collect button per token and a Claim all button that collects every token and then claims.

### Token pages and trading

`/token?address=0x…` reads everything from chain (`lib/curve.ts`): name, symbol, logo, description and socials from the token's `getTokenInfo()`, the bonding curve's reserves, fees and graduation progress, and its `CurveBuy` / `CurveSell` events, which drive the price line chart (lightweight-charts, 1m–1h buckets) and the transactions table. It refreshes every 8 s. Prices, market cap, liquidity and trade values are shown in USD using the ETH/USD rate from `api/eth-price.js` (Coinbase, falling back to CoinGecko and Kraken, edge-cached for 60 s); historical points use the current rate. The trade panel buys with ETH (`buy`) or sells (`approve` then `sell`) against the curve with a slippage bound; graduated tokens show a notice instead. Any token address can be opened from the Explore search box.

The Explore feed lists tokens launched through Zoza from the current browser (localStorage). A feed shared by every visitor would index `TokenLaunched` events from the factory.
