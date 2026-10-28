// Trading against a Pons V2 bonding curve (PonsV2BondingCurve, verified
// source: github.com/Minh3132/pons-labs, contractsV2/src/v2). Until a launch
// graduates into its Uniswap V4 pool, every buy and sell settles against the
// curve in native ETH, and each one emits CurveBuy / CurveSell — the trade
// history behind the token page's candles and transaction list.
import { createWalletClient, custom, formatEther, getAddress, parseAbi } from "viem";
import type { Address, EIP1193Provider, Hash } from "viem";

import { robinhoodChain } from "@/lib/chain";
import { LAUNCH_FACTORY, launchFactoryAbi } from "@/lib/launchpad";
import { ChainError, NO_RPC, ensureChain, readClient, toChainError, withTimeout } from "@/lib/rpc";

export const curveAbi = parseAbi([
  "function getReserves() view returns (uint256 quoteReserve_, uint256 tokenReserve_)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function sellableTokens() view returns (uint256)",
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
]);

export const launchedTokenAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function curve() view returns (address)",
  "function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
]);

const BPS = BigInt(10_000);
const ZERO = BigInt(0);

export type TokenInfo = {
  address: Address;
  name: string;
  symbol: string;
  totalSupply: bigint;
  curve: Address;
  deployer: Address;
  logo: string;
  description: string;
  socials: { twitter: string; telegram: string; discord: string; website: string; farcaster: string };
};

export type CurveState = {
  quoteReserve: bigint;
  tokenReserve: bigint;
  realQuote: bigint;
  threshold: bigint;
  sellable: bigint;
  graduated: boolean;
  feeBps: bigint;
  taxBps: bigint;
};

export type Trade = {
  kind: "buy" | "sell";
  trader: Address;
  /** ETH paid (buy) or gross ETH before fees (sell), in wei */
  eth: bigint;
  tokens: bigint;
  /** ETH per token */
  price: number;
  block: bigint;
  tx: Hash;
  logIndex: number;
  /** unix seconds */
  time: number;
};

type Client = ReturnType<typeof readClient>;

export async function fetchTokenInfo(client: Client, token: Address): Promise<TokenInfo> {
  const t = { address: token, abi: launchedTokenAbi } as const;
  const [name, symbol, totalSupply, curve, info] = await withTimeout(
    Promise.all([
      client.readContract({ ...t, functionName: "name" }),
      client.readContract({ ...t, functionName: "symbol" }),
      client.readContract({ ...t, functionName: "totalSupply" }),
      client.readContract({ ...t, functionName: "curve" }),
      client.readContract({ ...t, functionName: "getTokenInfo" }),
    ]),
    45_000,
    NO_RPC,
  );
  const [deployer, logo, description, socials] = info;
  return { address: token, name, symbol, totalSupply, curve, deployer, logo, description, socials };
}

export async function fetchCurve(client: Client, curve: Address): Promise<CurveState> {
  const c = { address: curve, abi: curveAbi } as const;
  const [[quoteReserve, tokenReserve], realQuote, threshold, sellable, graduated, feeBps, taxBps] = await withTimeout(
    Promise.all([
      client.readContract({ ...c, functionName: "getReserves" }),
      client.readContract({ ...c, functionName: "realQuoteReserve" }),
      client.readContract({ ...c, functionName: "graduationThreshold" }),
      client.readContract({ ...c, functionName: "sellableTokens" }),
      client.readContract({ ...c, functionName: "graduated" }),
      client.readContract({ ...c, functionName: "feeBps" }),
      client.readContract({ ...c, functionName: "creatorTaxBps" }),
    ]),
    45_000,
    NO_RPC,
  );
  return { quoteReserve, tokenReserve, realQuote, threshold, sellable, graduated, feeBps, taxBps };
}

/** Spot price in ETH per token. */
export const spotPrice = (s: CurveState) =>
  s.tokenReserve > ZERO ? Number(formatEther(s.quoteReserve)) / Number(formatEther(s.tokenReserve)) : 0;

/** Tokens received for `ethIn` wei, mirroring the curve's buy math. */
export function quoteBuy(s: CurveState, ethIn: bigint): bigint {
  if (ethIn <= ZERO) return ZERO;
  const net = (ethIn * (BPS - s.feeBps - s.taxBps)) / BPS;
  const out = (net * s.tokenReserve) / (s.quoteReserve + net);
  return out > s.sellable ? s.sellable : out;
}

/** ETH (wei) received for selling `tokensIn`, after fee and creator tax. */
export function quoteSell(s: CurveState, tokensIn: bigint): bigint {
  if (tokensIn <= ZERO) return ZERO;
  const gross = (tokensIn * s.quoteReserve) / (s.tokenReserve + tokensIn);
  return (gross * (BPS - s.feeBps - s.taxBps)) / BPS;
}

/** Applies a slippage tolerance (in bps) to an expected output. */
export const minOut = (expected: bigint, slippageBps: number) => (expected * (BPS - BigInt(slippageBps))) / BPS;

const blockTimes = new Map<bigint, number>();

/** Fetches unknown block timestamps a few at a time. */
async function stampBlocks(client: Client, blocks: bigint[]) {
  const todo = [...new Set(blocks)].filter((b) => !blockTimes.has(b));
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(
      todo.slice(i, i + 6).map(async (blockNumber) => {
        const block = await client.getBlock({ blockNumber });
        blockTimes.set(blockNumber, Number(block.timestamp));
      }),
    );
  }
}

/**
 * Logs in [from, to], split into chunks that shrink when the RPC rejects a
 * range as too large.
 */
async function chunkedLogs<T>(from: bigint, to: bigint, get: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  let size = BigInt(50_000);
  let start = from;
  while (start <= to) {
    const end = start + size - BigInt(1) < to ? start + size - BigInt(1) : to;
    try {
      out.push(...(await get(start, end)));
      start = end + BigInt(1);
    } catch (err) {
      if (size <= BigInt(500)) throw err;
      size /= BigInt(4);
    }
  }
  return out;
}

/** Trades on `curve` between two blocks, oldest first, with timestamps. */
export async function fetchTrades(client: Client, curve: Address, fromBlock: bigint, toBlock: bigint): Promise<Trade[]> {
  if (fromBlock > toBlock) return [];
  const buyEvent = curveAbi.find((x) => x.type === "event" && x.name === "CurveBuy")!;
  const sellEvent = curveAbi.find((x) => x.type === "event" && x.name === "CurveSell")!;
  const logs = await chunkedLogs(fromBlock, toBlock, (f, t) =>
    client.getLogs({ address: curve, events: [buyEvent, sellEvent], fromBlock: f, toBlock: t }),
  );
  // keep the latest 500 trades so the timestamp lookups stay bounded
  const recent = logs.slice(-500);
  await stampBlocks(client, recent.map((l) => l.blockNumber!));
  return recent.map((l) => {
    const base = { block: l.blockNumber!, tx: l.transactionHash!, logIndex: l.logIndex!, time: blockTimes.get(l.blockNumber!) ?? 0 };
    if (l.eventName === "CurveBuy") {
      const { buyer, quoteIn, tokensOut } = l.args;
      return { ...base, kind: "buy", trader: buyer!, eth: quoteIn!, tokens: tokensOut!, price: ethPerToken(quoteIn!, tokensOut!) };
    }
    const { seller, tokensIn, quoteOut, fee, tax } = l.args;
    const gross = quoteOut! + fee! + tax!;
    return { ...base, kind: "sell", trader: seller!, eth: gross, tokens: tokensIn!, price: ethPerToken(gross, tokensIn!) };
  });
}

const ethPerToken = (eth: bigint, tokens: bigint) =>
  tokens > ZERO ? Number(formatEther(eth)) / Number(formatEther(tokens)) : 0;

/**
 * Block the token was launched in, found from the factory's TokenLaunched
 * event by scanning back from the head (used when a token page is opened
 * without a known launch block).
 */
export async function findLaunchBlock(client: Client, token: Address, head: bigint): Promise<bigint | null> {
  const event = launchFactoryAbi.find((x) => x.type === "event" && x.name === "TokenLaunched")!;
  const span = BigInt(500_000);
  for (let to = head, i = 0; to > BigInt(0) && i < 12; i++) {
    const from = to > span ? to - span + BigInt(1) : BigInt(0);
    const logs = await chunkedLogs(from, to, (f, t) =>
      client.getLogs({ address: LAUNCH_FACTORY, event, args: { token }, fromBlock: f, toBlock: t }),
    );
    if (logs.length) return logs[0].blockNumber!;
    to = from - BigInt(1);
  }
  return null;
}

export type TradeResult = { hash: Hash };

/**
 * Buys with `ethIn` wei, or sells `tokensIn`, through the connected wallet:
 * switch to Robinhood Chain, approve the curve for a sell if needed, simulate,
 * then send the trade for the user to confirm.
 */
export async function trade(
  provider: EIP1193Provider,
  wallet: string,
  curve: Address,
  token: Address,
  order: { kind: "buy"; ethIn: bigint; minTokens: bigint } | { kind: "sell"; tokensIn: bigint; minEth: bigint },
  onStatus: (status: string) => void,
): Promise<TradeResult> {
  try {
    const account = getAddress(wallet.toLowerCase());
    onStatus("switching wallet to Robinhood Chain");
    await ensureChain(provider);
    const client = readClient(provider);
    const walletClient = createWalletClient({ chain: robinhoodChain, transport: custom(provider), account });

    if (order.kind === "sell") {
      const allowance = await client.readContract({ address: token, abi: launchedTokenAbi, functionName: "allowance", args: [account, curve] });
      if (allowance < order.tokensIn) {
        onStatus("approve the token in your wallet");
        const approveHash = await walletClient.writeContract({
          address: token,
          abi: launchedTokenAbi,
          functionName: "approve",
          args: [curve, order.tokensIn],
          chain: robinhoodChain,
          account,
        });
        onStatus("waiting for the approval");
        await client.waitForTransactionReceipt({ hash: approveHash, timeout: 180_000 });
      }
    }

    onStatus("checking the trade");
    let hash: Hash;
    if (order.kind === "buy") {
      const { request } = await withTimeout(
        client.simulateContract({
          address: curve,
          abi: curveAbi,
          functionName: "buy",
          args: [order.ethIn, order.minTokens, account],
          value: order.ethIn,
          account,
        }),
        45_000,
        NO_RPC,
      );
      onStatus("confirm the trade in your wallet");
      hash = await walletClient.writeContract(request);
    } else {
      const { request } = await withTimeout(
        client.simulateContract({
          address: curve,
          abi: curveAbi,
          functionName: "sell",
          args: [order.tokensIn, order.minEth, account],
          account,
        }),
        45_000,
        NO_RPC,
      );
      onStatus("confirm the trade in your wallet");
      hash = await walletClient.writeContract(request);
    }
    onStatus("waiting for confirmation");
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new ChainError("The trade reverted.");
    return { hash };
  } catch (err) {
    throw toChainError(err);
  }
}
