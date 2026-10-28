# Zoza

Landing page for **Zoza** — an AI agent that launches tokens on **Robinhood Chain**.

## What's inside

- Hero with an animated agent terminal
- Capabilities, how it works, network, roadmap, and FAQ sections
- **Interactive agent demo**: just provide a name, ticker, X account, and website (e.g. `token Liberty ticker LBTY x @liberty web liberty.io`). X and website can be skipped. Every token carries a fixed 3% buy & sell tax: 2% to the creator's wallet, 1% protocol fee. Zoza builds a blueprint and simulates the launch.

> The demo is a simulation — no on-chain transactions are sent.

## Running locally

Static site, no build step. Open `index.html` directly, or:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Deploys as-is to GitHub Pages, Vercel, or Netlify.
