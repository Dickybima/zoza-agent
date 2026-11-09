import { defineChain } from "viem";

// Elysium mainnet: Kinetiq's Arbitrum Orbit L2 on HyperEVM, with HYPE as gas.
//
// Zoza launches and trades through Montra (lib/montra.ts), so wallets reach
// Elysium through the Montra RPC: it reads from Elysium nodes and posts the
// transactions Montra carries (launches, trades, claims, plain HYPE transfers
// and withdrawals) into Elysium's inbox on HyperEVM, paying that gas
// (montramarkets.xyz/docs/rpc). NEXT_PUBLIC_ELYSIUM_RPC overrides it.
export const zozaChain = defineChain({
  id: 99901,
  name: "Elysium",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ELYSIUM_RPC || "https://rpc.montramarkets.xyz"] } },
  blockExplorers: {
    default: { name: "Elysium Explorer", url: process.env.NEXT_PUBLIC_ELYSIUM_EXPLORER || "https://elysium.kinetiq.xyz/explorer" },
  },
});

/** Display name of the network the site runs on. */
export const CHAIN_NAME = zozaChain.name;
/** Gas / quote currency symbol. */
export const NATIVE = zozaChain.nativeCurrency.symbol;

export const EXPLORER = zozaChain.blockExplorers.default.url;
export const explorerToken = (address: string) => `${EXPLORER}/token/${address}`;
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;
