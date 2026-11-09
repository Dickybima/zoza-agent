// Zoza launches and trades through Montra (montramarkets.xyz), the launchpad
// on Elysium. One `launch` call to Montra's factory creates the token, its
// Uniswap v4 pool and its locked liquidity; every trade then settles in that
// pool through Montra's LaunchRouter. Addresses are read from Montra's
// registry, the one address an app hard-codes (docs: montramarkets.xyz/docs/build).
// Zoza's launches carry Zoza's Montra builder code as an ERC-8021 suffix, so
// the Montra Builders programme credits them to Zoza.
import { concatHex, createWalletClient, custom, decodeEventLog, getAddress, stringToHex, toHex, zeroAddress, zeroHash } from "viem";
import type { Address, EIP1193Provider, Hash, Hex } from "viem";

import { CHAIN_NAME, NATIVE, zozaChain } from "@/lib/chain";
import { factoryAbi, hookAbi, lensAbi, montraTokenAbi, registryAbi, routerAbi } from "@/lib/montra-abi";
import { ChainError, NO_RPC, ensureChain, isInsufficientFunds, notEnoughEth, readClient, simulateFunded, toChainError, withTimeout } from "@/lib/rpc";

export const MONTRA = "https://montramarkets.xyz";
export const MONTRA_API = "https://api.montramarkets.xyz";
export const MONTRA_REGISTRY: Address = "0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7";
/** Zoza's Montra builder code (register it at montramarkets.xyz/builders/join). */
export const BUILDER_CODE = (process.env.NEXT_PUBLIC_MONTRA_BUILDER_CODE || "zoza").toLowerCase();
/** Fee tier Zoza launches at, in pips (1,000,000 = 100%): 3% of every trade. */
export const LAUNCH_FEE_PIPS = 30_000;

export const montraToken = (address: string) => `${MONTRA}/token/${address.toLowerCase()}`;

type Client = ReturnType<typeof readClient>;
const ZERO = BigInt(0);

/**
 * ERC-8021 attribution suffix for `code`: the code's ASCII, its length in a
 * byte, schema 0, then the 16-byte marker. Montra's indexer reads it from the
 * launch transaction; the factory never does.
 */
export function builderSuffix(code: string): Hex | undefined {
  if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(code)) return undefined;
  const ascii = stringToHex(code);
  return concatHex([ascii, toHex(code.length, { size: 1 }), "0x00", "0x80218021802180218021802180218021"]);
}

// ---- addresses ---------------------------------------------------------------

let addresses: Promise<{ factory: Address; router: Address; lens: Address }> | null = null;

/** Montra's factory, router and lens, read from its registry once per page. */
export function montraAddresses(client: Client) {
  addresses ??= (async () => {
    const get = (key: string) =>
      client.readContract({ address: MONTRA_REGISTRY, abi: registryAbi, functionName: "get", args: [stringToHex(key, { size: 32 })] });
    const [factory, router, lens] = await withTimeout(Promise.all([get("factory"), get("router"), get("lens")]), 30_000, NO_RPC);
    if ([factory, router, lens].some((a) => a === zeroAddress)) throw new ChainError("Montra’s registry didn’t name its contracts.");
    return { factory, router, lens };
  })().catch((err) => {
    addresses = null;
    throw err;
  });
  return addresses;
}

// ---- tokens and pools --------------------------------------------------------

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

export type TokenInfo = {
  address: Address;
  name: string;
  symbol: string;
  totalSupply: bigint;
  deployer: Address;
  logo: string;
  description: string;
  socials: { twitter: string; telegram: string; discord: string; website: string };
};

export type PoolState = {
  key: PoolKey;
  poolId: Hex;
  hook: Address;
  /** the quote (HYPE) is currency0, so a buy swaps zero-for-one */
  quoteIsCurrency0: boolean;
  /** HYPE per whole token at the pool's price now */
  price: number;
  /** total fee a sale pays, in pips */
  feePips: number;
  /** what a buy pays now (higher inside an anti-snipe window), in pips */
  buyFeePips: number;
  /** progress to the graduation line, 0–10,000 */
  graduationBps: number;
  /** pool stage: 0 below the line, 1 crossed, 2+ graduated */
  stage: number;
  /** who the pool's creator fees pay */
  recipient: Address;
};

const isMontraToken = (err: unknown) => !/returned no data|reverted/i.test(String((err as Error)?.message ?? ""));

export async function fetchTokenInfo(client: Client, token: Address): Promise<TokenInfo> {
  const t = { address: token, abi: montraTokenAbi } as const;
  const [name, symbol, totalSupply, info] = await withTimeout(
    Promise.all([
      client.readContract({ ...t, functionName: "name" }),
      client.readContract({ ...t, functionName: "symbol" }),
      client.readContract({ ...t, functionName: "totalSupply" }),
      client.readContract({ ...t, functionName: "getTokenInfo" }),
    ]),
    45_000,
    NO_RPC,
  );
  const [deployer, logo, description, s] = info;
  return {
    address: token,
    name,
    symbol,
    totalSupply,
    deployer,
    logo,
    description,
    socials: { twitter: s.twitter, telegram: s.telegram, discord: s.discord, website: s.website },
  };
}

/** HYPE per whole token from a pool's sqrtPriceX96 (both sides have 18 decimals). */
export function priceFromSqrt(sqrtPriceX96: bigint, quoteIsCurrency0: boolean): number {
  const r = Number(sqrtPriceX96) / 2 ** 96;
  const p = r * r; // currency1 per currency0
  if (!p) return 0;
  return quoteIsCurrency0 ? 1 / p : p;
}

/** A Montra token's pool, read in one call through Montra's lens. */
export async function fetchPool(client: Client, token: Address): Promise<PoolState> {
  const { lens } = await montraAddresses(client);
  let v;
  try {
    v = await withTimeout(client.readContract({ address: lens, abi: lensAbi, functionName: "tokenView", args: [token] }), 45_000, NO_RPC);
  } catch (err) {
    if (!isMontraToken(err)) throw new ChainError("This isn’t a Montra token: it has no Montra pool.");
    throw err;
  }
  const key = v.key as PoolKey;
  const quoteIsCurrency0 = v.config.quoteIsCurrency0;
  const poolId = (await client.readContract({ address: token, abi: montraTokenAbi, functionName: "poolId" })) as Hex;
  return {
    key,
    poolId,
    hook: key.hooks,
    quoteIsCurrency0,
    price: priceFromSqrt(v.sqrtPriceX96, quoteIsCurrency0),
    feePips: Number(v.totalFee),
    buyFeePips: Number(v.buyFee),
    graduationBps: Number(v.graduationProgressBps),
    stage: Number(v.config.stage),
    recipient: v.config.recipient,
  };
}

/**
 * Exact output of a swap after every fee and the price's move: Montra's
 * router runs it inside the pool manager and undoes it (an eth_call).
 */
export async function quote(client: Client, pool: PoolState, side: "buy" | "sell", amountIn: bigint): Promise<bigint> {
  if (amountIn <= ZERO) return ZERO;
  const { router } = await montraAddresses(client);
  const zeroForOne = side === "buy" ? pool.quoteIsCurrency0 : !pool.quoteIsCurrency0;
  const { result } = await withTimeout(
    client.simulateContract({ address: router, abi: routerAbi, functionName: "quoteExactIn", args: [pool.key, zeroForOne, amountIn] }),
    30_000,
    NO_RPC,
  );
  return result;
}

/** Applies a slippage tolerance (in bps) to an expected output. */
export const minOut = (expected: bigint, slippageBps: number) => (expected * BigInt(10_000 - slippageBps)) / BigInt(10_000);

export type TradeOrder = { kind: "buy"; hypeIn: bigint; minTokens: bigint } | { kind: "sell"; tokensIn: bigint; minHype: bigint };

const TRADE_GAS_LIMIT = BigInt(1_000_000);

/**
 * Buys or sells through Montra's router from the connected wallet: switch to
 * Elysium, approve the router for a sell if needed, simulate, then send.
 */
export async function trade(
  provider: EIP1193Provider,
  wallet: string,
  token: Address,
  order: TradeOrder,
  onStatus: (status: string) => void,
): Promise<{ hash: Hash }> {
  try {
    const account = getAddress(wallet.toLowerCase());
    onStatus(`switching wallet to ${CHAIN_NAME}`);
    await ensureChain(provider);
    const client = readClient(provider);
    const walletClient = createWalletClient({ chain: zozaChain, transport: custom(provider), account });
    const [{ router }, pool] = await Promise.all([montraAddresses(client), fetchPool(client, token)]);

    if (order.kind === "sell") {
      const allowance = await client.readContract({ address: token, abi: montraTokenAbi, functionName: "allowance", args: [account, router] });
      if (allowance < order.tokensIn) {
        onStatus("approve the token in your wallet");
        const approveHash = await walletClient.writeContract({
          address: token,
          abi: montraTokenAbi,
          functionName: "approve",
          args: [router, order.tokensIn],
          chain: zozaChain,
          account,
        });
        onStatus("waiting for the approval");
        const r = await client.waitForTransactionReceipt({ hash: approveHash, timeout: 300_000 });
        if (r.status !== "success") throw new ChainError("The approval reverted.");
      }
    }

    onStatus("checking the trade");
    const buy = order.kind === "buy";
    const amountIn = buy ? order.hypeIn : order.tokensIn;
    const value = buy ? order.hypeIn : ZERO;
    if (buy) {
      const balance = await withTimeout(client.getBalance({ address: account }), 30_000, NO_RPC);
      if (balance <= value) throw notEnoughEth(value, balance, account);
    }
    const args = [
      {
        key: pool.key,
        zeroForOne: buy ? pool.quoteIsCurrency0 : !pool.quoteIsCurrency0,
        amountIn,
        minAmountOut: buy ? order.minTokens : order.minHype,
        recipient: account,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      },
    ] as const;
    let request;
    try {
      ({ request } = await withTimeout(
        simulateFunded(
          (gas) => client.simulateContract({ address: router, abi: routerAbi, functionName: "swapExactIn", args, value, account, gas }),
          TRADE_GAS_LIMIT,
        ),
        45_000,
        NO_RPC,
      ));
    } catch (err) {
      if (buy && isInsufficientFunds(err)) throw notEnoughEth(value, await client.getBalance({ address: account }), account);
      throw err;
    }
    onStatus("confirm the trade in your wallet");
    const hash = await walletClient.writeContract(request);
    onStatus(`waiting for ${CHAIN_NAME} (usually under 30 seconds)`);
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 300_000 });
    if (receipt.status !== "success") throw new ChainError("The trade reverted.");
    return { hash };
  } catch (err) {
    throw toChainError(err);
  }
}

// ---- launching ---------------------------------------------------------------

export type LaunchInput = {
  name: string;
  ticker: string;
  x: string | null;
  website: string | null;
  /** logo image URL (https or ipfs) */
  logo: string;
  description?: string;
};

export type LaunchResult = { token: Address; poolId: Hex; hash: Hash; block: bigint; launchFee: bigint; feePips: number };

/**
 * The image and metadata document Montra's site gives a launch, stored by
 * Montra's API (through Zoza's api/montra-metadata.mjs, since the API only
 * takes uploads from Montra's own origin). Falls back to no document: the
 * token then carries its image in its on-chain profile alone.
 */
async function storeMetadata(input: LaunchInput, description: string, website: string, twitter: string) {
  try {
    const r = await fetch("/api/montra-metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: input.name, symbol: input.ticker, description, image: input.logo || undefined, website, twitter }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { uri?: string; image?: string };
    return { uri: j.uri ?? "", image: j.image ?? input.logo };
  } catch {
    return { uri: "", image: input.logo };
  }
}

// the factory's launch: token, pool, seed; generous, only used to price a simulation
const LAUNCH_GAS_LIMIT = BigInt(8_000_000);

/** The factory's native-HYPE row at Zoza's tier with no anti-snipe fee. */
async function pickConfig(client: Client, factory: Address): Promise<bigint> {
  const count = await client.readContract({ address: factory, abi: factoryAbi, functionName: "configCount" });
  const ok = (c: { quote: Address; totalFeePips: number; earlyBuyFeeWindow: number; enabled: boolean; exists: boolean }) =>
    c.exists && c.enabled && c.quote === zeroAddress && c.totalFeePips === LAUNCH_FEE_PIPS && c.earlyBuyFeeWindow === 0;
  // the menu lists its plain HYPE tiers first; read those, then the rest if needed
  for (let id = BigInt(0); id < count; id += BigInt(1)) {
    const c = await client.readContract({ address: factory, abi: factoryAbi, functionName: "getConfig", args: [id] });
    if (ok(c)) return id;
  }
  throw new ChainError("Montra has no HYPE launch tier at 3% open right now.");
}

/**
 * Launches a token on Montra from the connected wallet: the token, its
 * Uniswap v4 pool and its locked liquidity in one transaction, the creator's
 * fee share paid to the launching wallet. Resolves once Elysium has run it.
 */
export async function launchOnMontra(
  provider: EIP1193Provider,
  wallet: string,
  input: LaunchInput,
  onStatus: (status: string) => void,
): Promise<LaunchResult> {
  try {
    const account = getAddress(wallet.toLowerCase());
    onStatus(`switching wallet to ${CHAIN_NAME}`);
    await ensureChain(provider);
    const client = readClient(provider);
    const walletClient = createWalletClient({ chain: zozaChain, transport: custom(provider), account });

    onStatus("reading Montra’s launch terms");
    const { factory } = await montraAddresses(client);
    const [enabled, launchFee, configId] = await withTimeout(
      Promise.all([
        client.readContract({ address: factory, abi: factoryAbi, functionName: "launchEnabled" }),
        client.readContract({ address: factory, abi: factoryAbi, functionName: "launchFee" }),
        pickConfig(client, factory),
      ]),
      60_000,
      NO_RPC,
    );
    if (!enabled) throw new ChainError("Montra has paused new launches for now. Try again shortly.");

    const description = input.description ?? `${input.name} ($${input.ticker}) — launched with Zoza.`;
    const twitter = input.x ? `https://x.com/${input.x}` : "";
    const website = input.website ? `https://${input.website}` : "";
    onStatus("storing the token’s metadata");
    const meta = await storeMetadata(input, description, website, twitter);

    const params = {
      name: input.name,
      symbol: input.ticker,
      metadataURI: meta.uri,
      profile: { logo: meta.image, description, socials: { telegram: "", twitter, discord: "", website, extra: "" } },
      configId,
      supply: ZERO, // the row's own 1,000,000,000
      salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
      feeRecipients: [] as Address[], // the creator's own wallet
      feeShares: [] as number[],
      firstBuyAmount: ZERO,
      firstBuyMinOut: ZERO,
      permit: { deadline: ZERO, v: 0, r: zeroHash, s: zeroHash },
    };

    const balance = await withTimeout(client.getBalance({ address: account }), 30_000, NO_RPC);
    if (balance <= launchFee) throw notEnoughEth(launchFee, balance, account);

    onStatus("checking the launch");
    const dataSuffix = builderSuffix(BUILDER_CODE);
    let request;
    try {
      ({ request } = await withTimeout(
        simulateFunded(
          (gas) =>
            client.simulateContract({ address: factory, abi: factoryAbi, functionName: "launch", args: [params], value: launchFee, account, gas, dataSuffix }),
          LAUNCH_GAS_LIMIT,
        ),
        60_000,
        NO_RPC,
      ));
    } catch (err) {
      if (isInsufficientFunds(err)) throw notEnoughEth(launchFee, balance, account);
      throw err;
    }

    onStatus("confirm the launch in your wallet");
    const hash = await walletClient.writeContract({ ...request, dataSuffix });

    onStatus(`waiting for ${CHAIN_NAME} (usually under 30 seconds)`);
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 300_000 });
    if (receipt.status !== "success") throw new ChainError("The launch transaction reverted.");
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "TokenLaunched") {
          return { token: ev.args.token, poolId: ev.args.poolId, hash, block: receipt.blockNumber, launchFee, feePips: LAUNCH_FEE_PIPS };
        }
      } catch {
        // another factory event
      }
    }
    throw new ChainError("Launch confirmed, but the token address could not be read from the receipt.");
  } catch (err) {
    throw toChainError(err);
  }
}

// ---- creator fees ------------------------------------------------------------

/** What `claim` would pay the pool's recipient right now, in HYPE wei. */
export async function creatorClaimable(client: Client, pool: Pick<PoolState, "hook" | "poolId">): Promise<bigint> {
  const { lens } = await montraAddresses(client);
  const { result } = await client.simulateContract({ address: lens, abi: lensAbi, functionName: "creatorClaimable", args: [pool.hook, pool.poolId] });
  return result as bigint;
}

/** Claims a pool's creator fees to the connected wallet (its recipient only). */
export async function claimCreatorFees(
  provider: EIP1193Provider,
  wallet: string,
  pool: Pick<PoolState, "hook" | "poolId">,
  onStatus: (status: string) => void,
): Promise<Hash> {
  try {
    const account = getAddress(wallet.toLowerCase());
    onStatus(`switching wallet to ${CHAIN_NAME}`);
    await ensureChain(provider);
    const client = readClient(provider);
    const walletClient = createWalletClient({ chain: zozaChain, transport: custom(provider), account });
    onStatus("checking the claim");
    const { request } = await withTimeout(
      client.simulateContract({ address: pool.hook, abi: hookAbi, functionName: "claim", args: [pool.poolId, account], account }),
      45_000,
      NO_RPC,
    );
    onStatus("confirm the claim in your wallet");
    const hash = await walletClient.writeContract(request);
    onStatus(`waiting for ${CHAIN_NAME}`);
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 300_000 });
    if (receipt.status !== "success") throw new ChainError("The claim reverted.");
    return hash;
  } catch (err) {
    throw toChainError(err);
  }
}

// ---- Montra's public API -----------------------------------------------------

export type MontraCard = {
  address: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  creator: string;
  poolId: string;
  price: string;
  priceUsd: number | null;
  marketCap: string;
  marketCapUsd: number | null;
  volume24h: string;
  holders: number;
  swaps: number;
  launchedAt: number;
  totalFeePips: number;
  graduation: { stage: "new" | "graduating" | "graduated"; progressBps: number };
  quote: { symbol: string; usd: number | null };
};

export type MontraTrade = {
  id: number;
  txHash: Hash;
  t: number;
  sender: Address;
  isBuy: boolean;
  quoteAmount: string;
  tokenAmount: string;
  price: string;
};

async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${MONTRA_API}${path}`);
  if (!r.ok) throw new Error(`Montra API ${r.status}`);
  return (await r.json()) as T;
}

export const montraApi = {
  token: (token: string) => api<MontraCard & { description?: string; live?: { creatorClaimable?: string } | null }>(`/api/tokens/${token.toLowerCase()}`),
  trades: (token: string, limit = 200) => api<{ trades: MontraTrade[] }>(`/api/tokens/${token.toLowerCase()}/trades?limit=${limit}`),
  holdings: (wallet: string) => api<{ holdings?: (MontraCard & { balance: string; value?: string })[] }>(`/api/wallets/${wallet.toLowerCase()}/holdings`),
  launchesOf: (wallet: string) => api<{ tokens?: MontraCard[]; launches?: MontraCard[] }>(`/api/wallets/${wallet.toLowerCase()}/launches`),
  lanes: (wallet: string) => api<Record<string, unknown>>(`/api/wallets/${wallet.toLowerCase()}/lanes`),
  stats: () => api<{ tokensLaunched?: number }>(`/api/stats`),
};

export { NATIVE };
