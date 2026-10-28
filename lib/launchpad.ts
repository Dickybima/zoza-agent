// On-chain token launches through the Pons V2 launch factory on Robinhood
// Chain (PonsV2LaunchFactory, verified source: github.com/Minh3132/pons-labs,
// contractsV2/src/v2/PonsV2LaunchFactory.sol). Every launch mints its full
// supply into a bonding curve that later graduates into a locked Uniswap V4
// pool; the creator tax set here is paid entirely to the creator.
import {
  BaseError,
  UserRejectedRequestError,
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  getAddress,
  parseAbi,
  toHex,
  zeroAddress,
} from "viem";
import type { Address, EIP1193Provider, Hash } from "viem";

import { robinhoodChain } from "@/lib/chain";

export const LAUNCH_FACTORY: Address = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

export const launchFactoryAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)",
  "function launchFee() view returns (uint256)",
  "function canLaunch(address launcher) view returns (bool)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
]);

export type LaunchInput = {
  name: string;
  ticker: string;
  x: string | null;
  website: string | null;
  /** creator tax in basis points, paid to the creator on every buy and sell */
  creatorTaxBps: number;
};

export type LaunchResult = {
  token: Address;
  curve: Address;
  hash: Hash;
  launchFee: bigint;
  /** the launch config's base trade fee, in basis points */
  baseFeeBps: number;
};

export class LaunchError extends Error {
  constructor(
    message: string,
    readonly rejected = false,
  ) {
    super(message);
  }
}

const CHAIN_HEX = toHex(robinhoodChain.id);
const RPC_URL = robinhoodChain.rpcUrls.default.http[0];

/** Rejects with `message` if `promise` has not settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LaunchError(message)), ms);
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
 * Read transport that asks every source at once — Zoza's same-origin proxy,
 * Robinhood Chain's public RPC and the wallet's own RPC — and takes the first
 * answer, so one blocked, rate-limited or hanging endpoint cannot stall a
 * launch. When every source fails, the most informative error wins (a revert
 * carries data viem decodes into a readable reason).
 */
function racingReads(sources: RpcSource[], timeoutMs = 20_000) {
  return custom(
    {
      async request(req: RpcRequest) {
        const attempts = sources.map((s) =>
          withTimeout(s.request(req), timeoutMs, `${s.name}: no response`).catch((err: RpcFailure) => {
            throw Object.assign(err, { source: s.name });
          }),
        );
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

const WRONG_NETWORK =
  "Your wallet is not on Robinhood Chain. Switch it to Robinhood Chain (chain ID 4663) — or use a wallet that supports custom networks, such as MetaMask or Rabby — then press Launch again.";

/** Switches the wallet to Robinhood Chain, adding the network if it is unknown. */
async function ensureChain(provider: EIP1193Provider) {
  const onChain = async () => Number(await provider.request({ method: "eth_chainId" })) === robinhoodChain.id;
  if (await onChain()) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 4001) throw new LaunchError("Network switch was rejected in your wallet.", true);
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
      if ((addErr as { code?: number }).code === 4001) throw new LaunchError("Adding Robinhood Chain was rejected in your wallet.", true);
      throw new LaunchError(WRONG_NETWORK);
    }
  }
  // some wallets resolve the switch without actually changing networks
  if (!(await onChain())) throw new LaunchError(WRONG_NETWORK);
}

const randomSalt = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

function explain(err: unknown): LaunchError {
  if (err instanceof LaunchError) return err;
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return new LaunchError("Transaction rejected in your wallet.", true);
    }
    if (/unknown RPC error|HTTP request failed|took too long/i.test(err.shortMessage)) {
      return new LaunchError("Couldn’t reach Robinhood Chain from your browser or your wallet. Check your connection, then press Launch again.");
    }
    return new LaunchError(err.shortMessage);
  }
  if ((err as { code?: number })?.code === 4001) return new LaunchError("Request rejected in your wallet.", true);
  return new LaunchError(err instanceof Error ? err.message : "Unknown error");
}

/**
 * Launches a token from the connected wallet. The wallet is asked to switch
 * to Robinhood Chain if needed and then to confirm the launch transaction,
 * which pays the factory's launch fee. Resolves once the launch is mined.
 */
export async function launchToken(
  provider: EIP1193Provider,
  wallet: string,
  input: LaunchInput,
  onStatus: (status: string) => void,
): Promise<LaunchResult> {
  try {
    // wallets may report lowercase or non-checksummed addresses
    const account = getAddress(wallet.toLowerCase());
    onStatus("switching wallet to Robinhood Chain");
    // the switch may wait on a wallet prompt, so allow time for the user
    await withTimeout(ensureChain(provider), 90_000, WRONG_NETWORK);

    // Reads race the proxy, the public RPC and the wallet; only the launch
    // transaction itself needs the wallet.
    const readTransport = racingReads([
      httpSource("zoza-proxy", "/api/rpc"),
      httpSource("public-rpc", RPC_URL),
      { name: "wallet", request: (req) => provider.request(req as Parameters<EIP1193Provider["request"]>[0]) },
    ]);
    const publicClient = createPublicClient({ chain: robinhoodChain, transport: readTransport, pollingInterval: 2_000 });
    const walletClient = createWalletClient({ chain: robinhoodChain, transport: custom(provider), account });
    const factory = { address: LAUNCH_FACTORY, abi: launchFactoryAbi } as const;
    const NO_RPC = "Robinhood Chain did not respond. Check your connection and press Launch to try again.";

    onStatus("reading launch terms");
    const [allowed, launchFee, maxCreatorTaxBps, configCount] = await withTimeout(
      Promise.all([
        publicClient.readContract({ ...factory, functionName: "canLaunch", args: [account] }),
        publicClient.readContract({ ...factory, functionName: "launchFee" }),
        publicClient.readContract({ ...factory, functionName: "maxCreatorTaxBps" }),
        publicClient.readContract({ ...factory, functionName: "launchConfigCount" }),
      ]),
      45_000,
      NO_RPC,
    );
    if (!allowed) throw new LaunchError("Launching is currently limited to whitelisted creators on this launchpad.");
    if (BigInt(input.creatorTaxBps) > maxCreatorTaxBps) {
      throw new LaunchError(`The launchpad caps the creator tax at ${Number(maxCreatorTaxBps) / 100}%.`);
    }

    // first enabled config, priced in native ETH
    let configId: bigint | null = null;
    let baseFeeBps = 0;
    for (let id = BigInt(0); id < configCount && configId === null; id += BigInt(1)) {
      const config = await withTimeout(
        publicClient.readContract({ ...factory, functionName: "getLaunchConfig", args: [id] }),
        30_000,
        NO_RPC,
      );
      if (config.enabled) {
        configId = id;
        baseFeeBps = Number(config.curveFeeBps);
      }
    }
    if (configId === null) throw new LaunchError("No launch configuration is currently enabled.");
    // pin the quoted terms so an owner update cannot reprice this launch mid-flight
    const expectedEconomics = await withTimeout(
      publicClient.readContract({ ...factory, functionName: "previewLaunchEconomics", args: [configId, zeroAddress] }),
      30_000,
      NO_RPC,
    );

    const params = {
      name: input.name,
      symbol: input.ticker,
      logo: "",
      description: `${input.name} ($${input.ticker}) — launched with Zoza.`,
      socials: {
        twitter: input.x ? `https://x.com/${input.x}` : "",
        telegram: "",
        discord: "",
        website: input.website ? `https://${input.website}` : "",
        farcaster: "",
      },
      creatorFeeRecipient: account,
      creatorTaxBps: input.creatorTaxBps,
      buybackEnabled: false,
      expectedEconomics,
      salt: randomSalt(),
    };

    // simulate first so a revert surfaces as a readable error, not a failed tx
    onStatus("checking the launch");
    const { request } = await withTimeout(
      publicClient.simulateContract({
        ...factory,
        functionName: "launchToken",
        args: [params, configId, zeroAddress],
        value: launchFee,
        account,
      }),
      45_000,
      NO_RPC,
    );

    onStatus("confirm the launch in your wallet");
    const hash = await walletClient.writeContract(request);

    onStatus("waiting for confirmation on Robinhood Chain");
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new LaunchError("The launch transaction reverted.");

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== LAUNCH_FACTORY.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: launchFactoryAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "TokenLaunched") {
          return { token: ev.args.token, curve: ev.args.curve, hash, launchFee, baseFeeBps };
        }
      } catch {
        // not a factory event we know
      }
    }
    throw new LaunchError("Launch confirmed, but the token address could not be read from the receipt.");
  } catch (err) {
    throw explain(err);
  }
}
