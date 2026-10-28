// Shared Robinhood Chain plumbing for launches and trading: a read client that
// races several RPC sources, wallet network switching, timeouts, and turning
// wallet / RPC failures into readable messages.
import { BaseError, InsufficientFundsError, UserRejectedRequestError, createPublicClient, custom, toHex } from "viem";
import type { EIP1193Provider } from "viem";

import { shortAddr } from "@/lib/agent";
import { robinhoodChain } from "@/lib/chain";
import { fmtEth } from "@/lib/format";

export class ChainError extends Error {
  constructor(
    message: string,
    /** true when the user declined a wallet prompt */
    readonly rejected = false,
  ) {
    super(message);
  }
}

const CHAIN_HEX = toHex(robinhoodChain.id);
export const RPC_URL = robinhoodChain.rpcUrls.default.http[0];

/** Rejects with `message` if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ChainError(message)), ms);
    }),
  ]);
}

type RpcRequest = { method: string; params?: unknown };
type RpcSource = { name: string; request: (req: RpcRequest) => Promise<unknown> };
type RpcFailure = Error & { code?: number; data?: unknown };

const rpcError = (e: { code?: number; message?: string; data?: unknown }): RpcFailure =>
  Object.assign(new Error(e.message ?? "RPC error"), { code: e.code, data: e.data });

/** A JSON-RPC endpoint reached over fetch. */
function httpSource(name: string, url: string): RpcSource {
  let id = 0;
  return {
    name,
    async request({ method, params }) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
      });
      if (!res.ok && res.status !== 400) throw rpcError({ message: `${name}: HTTP ${res.status}` });
      const json = await res.json();
      if (json.error) throw rpcError(json.error);
      return json.result;
    },
  };
}

/**
 * Read transport that asks every source at once — Zoza's same-origin proxy
 * (api/rpc.js), Robinhood Chain's public RPC and, when connected, the
 * wallet's own RPC — and takes the first answer, so one blocked,
 * rate-limited or hanging endpoint cannot stall the app. When every source
 * fails, the most informative error wins (a revert carries data viem decodes
 * into a readable reason).
 */
function racingReads(sources: RpcSource[], timeoutMs = 20_000) {
  return custom(
    {
      async request(req: RpcRequest) {
        const attempts = sources.map((s) => withTimeout(s.request(req), timeoutMs, `${s.name}: no response`));
        try {
          return await Promise.any(attempts);
        } catch (agg) {
          const errors = ((agg as AggregateError).errors ?? []) as RpcFailure[];
          console.warn(`[zoza] ${req.method} failed on every RPC source`, errors);
          throw errors.find((e) => e.data || /revert/i.test(e.message)) ?? errors[0] ?? agg;
        }
      },
    },
    { retryCount: 1 },
  );
}

/** Public client for chain reads; pass the wallet's provider to add it as a source. */
export function readClient(provider?: EIP1193Provider | null) {
  const sources: RpcSource[] = [httpSource("zoza-proxy", "/api/rpc"), httpSource("public-rpc", RPC_URL)];
  if (provider) {
    sources.push({ name: "wallet", request: (req) => provider.request(req as Parameters<EIP1193Provider["request"]>[0]) });
  }
  return createPublicClient({ chain: robinhoodChain, transport: racingReads(sources), pollingInterval: 2_000 });
}

export const WRONG_NETWORK =
  "Your wallet is not on Robinhood Chain. Switch it to Robinhood Chain (chain ID 4663) — or use a wallet that supports custom networks, such as MetaMask or Rabby — then try again.";

/** Switches the wallet to Robinhood Chain, adding the network if it is unknown. */
async function switchToRobinhood(provider: EIP1193Provider) {
  const onChain = async () => Number(await provider.request({ method: "eth_chainId" })) === robinhoodChain.id;
  if (await onChain()) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 4001) throw new ChainError("Network switch was rejected in your wallet.", true);
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: robinhoodChain.name,
            nativeCurrency: robinhoodChain.nativeCurrency,
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [robinhoodChain.blockExplorers.default.url],
          },
        ],
      });
    } catch (addErr) {
      if ((addErr as { code?: number }).code === 4001) throw new ChainError("Adding Robinhood Chain was rejected in your wallet.", true);
      throw new ChainError(WRONG_NETWORK);
    }
  }
  // some wallets resolve the switch without actually changing networks
  if (!(await onChain())) throw new ChainError(WRONG_NETWORK);
}

/** Same, bounded: the switch may wait on a wallet prompt, so allow the user time. */
export const ensureChain = (provider: EIP1193Provider) => withTimeout(switchToRobinhood(provider), 90_000, WRONG_NETWORK);

export const NO_RPC = "Robinhood Chain did not respond. Check your connection and try again.";

export const isInsufficientFunds = (err: unknown) =>
  (err instanceof BaseError && !!err.walk((e) => e instanceof InsufficientFundsError)) ||
  /insufficient funds|exceeds the balance/i.test(String((err as Error)?.message ?? ""));

/** Readable "top up your wallet" error with the amounts involved. */
export const notEnoughEth = (need: bigint, have: bigint, account: string) =>
  new ChainError(
    `Not enough ETH on Robinhood Chain: this needs ${fmtEth(need)} ETH plus gas, and ${shortAddr(account)} holds ${fmtEth(have)} ETH. ` +
      "Send or bridge ETH to this wallet on Robinhood Chain (chain ID 4663), then try again.",
  );

/**
 * Simulates a payable call. Arbitrum-based nodes (Robinhood Chain is an
 * Arbitrum Orbit chain) price an eth_call without a gas limit at the RPC's
 * gas cap, so a wallet that can easily afford the real transaction may be
 * refused as "insufficient funds". Retry once with a realistic gas limit and
 * hand the wallet a request without one, so it estimates gas itself.
 */
export async function simulateFunded<R extends { request: object }>(run: (gas?: bigint) => Promise<R>, gasLimit: bigint): Promise<R> {
  try {
    return await run();
  } catch (err) {
    if (!isInsufficientFunds(err)) throw err;
    const res = await run(gasLimit);
    return { ...res, request: { ...res.request, gas: undefined } };
  }
}

export function toChainError(err: unknown): ChainError {
  if (err instanceof ChainError) return err;
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return new ChainError("Transaction rejected in your wallet.", true);
    }
    if (isInsufficientFunds(err)) {
      return new ChainError("Not enough ETH on Robinhood Chain to cover this transaction plus gas. Top up this wallet on Robinhood Chain (chain ID 4663), then try again.");
    }
    if (/unknown RPC error|HTTP request failed|took too long/i.test(err.shortMessage)) {
      return new ChainError("Couldn’t reach Robinhood Chain from your browser or your wallet. Check your connection, then try again.");
    }
    return new ChainError(err.shortMessage);
  }
  if ((err as { code?: number })?.code === 4001) return new ChainError("Request rejected in your wallet.", true);
  return new ChainError(err instanceof Error ? err.message : "Unknown error");
}
