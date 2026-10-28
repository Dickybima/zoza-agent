import { defineChain } from "viem";

// Robinhood Chain mainnet (Arbitrum Orbit L2, ETH gas).
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const EXPLORER = robinhoodChain.blockExplorers.default.url;
export const explorerToken = (address: string) => `${EXPLORER}/token/${address}`;
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
