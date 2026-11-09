// Shared Elysium plumbing for launches and trading: a read client that
// races several RPC sources, wallet network switching, timeouts, and turning
// wallet / RPC failures into readable messages.
import { BaseError, InsufficientFundsError, UserRejectedRequestError, createPublicClient, custom, toHex } from "viem";
import type { EIP1193Provider } from "viem";

import { shortAddr } from "@/lib/agent";
import { CHAIN_NAME, NATIVE, zozaChain } from "@/lib/chain";
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

const CHAIN_HEX = toHex(zozaChain.id);
export const RPC_URL = zozaChain.rpcUrls.default.http[0];

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

/** base64url of a UTF-8 string, for cacheable GET requests to the proxy. */
const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * A JSON-RPC endpoint reached over fetch. With `cacheableGet`, small requests
 * go out as GET with a fixed id so identical reads share the edge cache.
 */
function httpSource(name: string, url: string, cacheableGet = false): RpcSource {
  let id = 0;
  return {
    name,
    async request({ method, params }) {
      const fixed = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] });
      const res =
        cacheableGet && fixed.length < 1500
          ? await fetch(`${url}?b=${b64url(fixed)}`)
          : await fetch(url, {
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
 * Read transport: asks the direct sources first (Elysium's public RPC
 * and, when connected, the wallet's own RPC) and takes the first answer. Zoza's
 * same-origin proxy (api/rpc.js) is only a fallback, joining when the direct
 * sources fail or haven't answered within HEDGE_MS, since every proxied read is
 * a billed serverless call. A public RPC the browser can't reach (CORS, blocked
 * network) is skipped for a while so later reads go straight to the proxy.
 * When every source fails, the most informative error wins (a revert carries
 * data viem decodes into a readable reason).
 */
const HEDGE_MS = 3_000;
const DIRECT_COOLDOWN_MS = 60_000;
let directDownUntil = 0;
const isNetworkFailure = (e: RpcFailure) => e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(e.message);

function hedgedReads(direct: RpcSource[], fallback: RpcSource, timeoutMs = 20_000) {
  return custom(
    {
      async request(req: RpcRequest) {
        const errors: RpcFailure[] = [];
        const ask = (s: RpcSource) =>
          withTimeout(s.request(req), timeoutMs, `${s.name}: no response`).catch((e: RpcFailure) => {
            errors.push(e);
            throw e;
          });
        let proxied: Promise<unknown> | undefined;
        const proxy = () => (proxied ??= ask(fallback));
        const skipDirect = Date.now() < directDownUntil;
        let hedge: ReturnType<typeof setTimeout> | undefined;
        try {
          if (skipDirect) return await proxy();
          const directAny = Promise.any(direct.map(ask));
          // the proxy joins if the direct sources all fail, or are still silent after HEDGE_MS
          const backup = new Promise((resolve, reject) => {
            hedge = setTimeout(() => proxy().then(resolve, reject), HEDGE_MS);
            directAny.catch((agg: AggregateError) => {
              clearTimeout(hedge);
              // a revert is the chain's real answer; asking the proxy would only repeat it
              const revert = errors.find((e) => e.data || /revert/i.test(e.message));
              if (revert) return reject(agg);
              // unreachable (CORS, blocked network) rather than a revert: skip it for a while
              if (errors.some(isNetworkFailure)) directDownUntil = Date.now() + DIRECT_COOLDOWN_MS;
              proxy().then(resolve, reject);
            });
          });
          return await Promise.any([directAny, backup]);
        } catch {
          console.warn(`[zoza] ${req.method} failed on every RPC source`, errors);
          throw errors.find((e) => e.data || /revert/i.test(e.message)) ?? errors[0] ?? new Error("RPC error");
        } finally {
          clearTimeout(hedge);
        }
      },
    },
    { retryCount: 1 },
  );
}

/** Public client for chain reads; pass the wallet's provider to add it as a source. */
export function readClient(provider?: EIP1193Provider | null) {
  const direct: RpcSource[] = [httpSource("public-rpc", RPC_URL)];
  if (provider) {
    direct.push({ name: "wallet", request: (req) => provider.request(req as Parameters<EIP1193Provider["request"]>[0]) });
  }
  return createPublicClient({ chain: zozaChain, transport: hedgedReads(direct, httpSource("zoza-proxy", "/api/rpc", true)), pollingInterval: 2_000 });
}

export const WRONG_NETWORK = `Your wallet is not on ${CHAIN_NAME}. Switch it to ${CHAIN_NAME} (chain ID ${zozaChain.id}) — or use a wallet that supports custom networks, such as MetaMask or Rabby — then try again.`;

/** Switches the wallet to Elysium, adding the network if it is unknown. */
async function switchToElysium(provider: EIP1193Provider) {
  const onChain = async () => Number(await provider.request({ method: "eth_chainId" })) === zozaChain.id;
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
            chainName: zozaChain.name,
            nativeCurrency: zozaChain.nativeCurrency,
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [zozaChain.blockExplorers.default.url],
          },
        ],
      });
    } catch (addErr) {
      if ((addErr as { code?: number }).code === 4001) throw new ChainError(`Adding ${CHAIN_NAME} was rejected in your wallet.`, true);
      throw new ChainError(WRONG_NETWORK);
    }
  }
  // some wallets resolve the switch without actually changing networks
  if (!(await onChain())) throw new ChainError(WRONG_NETWORK);
}

/** Same, bounded: the switch may wait on a wallet prompt, so allow the user time. */
export const ensureChain = (provider: EIP1193Provider) => withTimeout(switchToElysium(provider), 90_000, WRONG_NETWORK);

export const NO_RPC = `${CHAIN_NAME} did not respond. Check your connection and try again.`;

export const isInsufficientFunds = (err: unknown) =>
  (err instanceof BaseError && !!err.walk((e) => e instanceof InsufficientFundsError)) ||
  /insufficient funds|exceeds the balance/i.test(String((err as Error)?.message ?? ""));

/** Readable "top up your wallet" error with the amounts involved. */
export const notEnoughEth = (need: bigint, have: bigint, account: string) =>
  new ChainError(
    `Not enough ${NATIVE} on ${CHAIN_NAME}: this needs ${fmtEth(need)} ${NATIVE} plus gas, and ${shortAddr(account)} holds ${fmtEth(have)} ${NATIVE}. ` +
      `Bridge ${NATIVE} to this wallet on ${CHAIN_NAME} (chain ID ${zozaChain.id}) from the Bridge page, then try again.`,
  );

/**
 * Simulates a payable call. Arbitrum-based nodes (Elysium is an
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
      return new ChainError(`Not enough ${NATIVE} on ${CHAIN_NAME} to cover this transaction plus gas. Bridge ${NATIVE} to this wallet on ${CHAIN_NAME} (chain ID ${zozaChain.id}), then try again.`);
    }
    if (/unknown RPC error|HTTP request failed|took too long/i.test(err.shortMessage)) {
      return new ChainError(`Couldn’t reach ${CHAIN_NAME} from your browser or your wallet. Check your connection, then try again.`);
    }
    return new ChainError(err.shortMessage);
  }
  if ((err as { code?: number })?.code === 4001) return new ChainError("Request rejected in your wallet.", true);
  return new ChainError(err instanceof Error ? err.message : "Unknown error");
}
