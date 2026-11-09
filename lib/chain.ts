import { defineChain } from "viem";

// Elysium: Kinetiq's Arbitrum Orbit L2 on HyperEVM, with HYPE as gas.
//
// The site runs on Elysium Testnet until Elysium mainnet's public RPC is
// published; setting NEXT_PUBLIC_ELYSIUM_MAINNET_RPC (and redeploying) moves
// everything — launches, trading, fees, portfolio — to mainnet.
const MAINNET_RPC = process.env.NEXT_PUBLIC_ELYSIUM_MAINNET_RPC || "";

export const IS_TESTNET = !MAINNET_RPC;

export const zozaChain = IS_TESTNET
  ? defineChain({
      id: 99801,
      name: "Elysium Testnet",
      nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
      rpcUrls: { default: { http: ["https://testnet-rpc.elysium.kinetiq.xyz"] } },
      blockExplorers: {
        default: { name: "Elysium Explorer", url: process.env.NEXT_PUBLIC_ELYSIUM_EXPLORER || "https://testnet.elysium.kinetiq.xyz/explorer" },
      },
      testnet: true,
    })
  : defineChain({
      id: 99901,
      name: "Elysium",
      nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
      rpcUrls: { default: { http: [MAINNET_RPC] } },
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
