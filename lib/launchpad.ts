// On-chain token launches through the Pons V2 launch factory on Robinhood
// Chain (PonsV2LaunchFactory, verified source: github.com/Minh3132/pons-labs,
// contractsV2/src/v2/PonsV2LaunchFactory.sol). Every launch mints its full
// supply into a bonding curve that later graduates into a locked Uniswap V4
// pool; the creator tax set here is paid entirely to the creator.
import { createWalletClient, custom, decodeEventLog, getAddress, parseAbi, toHex, zeroAddress } from "viem";
import type { Address, EIP1193Provider, Hash } from "viem";

import { robinhoodChain } from "@/lib/chain";
import { ChainError, NO_RPC, ensureChain, isInsufficientFunds, notEnoughEth, readClient, simulateFunded, toChainError, withTimeout } from "@/lib/rpc";

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
  /** logo image URL stored in the token's on-chain metadata */
  logo: string;
  /** creator tax in basis points, paid to the creator on every buy and sell */
  creatorTaxBps: number;
};

export type LaunchResult = {
  token: Address;
  curve: Address;
  hash: Hash;
  block: bigint;
  launchFee: bigint;
  /** the launch config's base trade fee, in basis points */
  baseFeeBps: number;
};

export { ChainError as LaunchError } from "@/lib/rpc";
// deploys the token and its bonding curve; generous, only used to price a simulation
const LAUNCH_GAS_LIMIT = BigInt(12_000_000);

const randomSalt = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

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
    await ensureChain(provider);

    // reads race the proxy, the public RPC and the wallet; only the launch
    // transaction itself needs the wallet
    const publicClient = readClient(provider);
    const walletClient = createWalletClient({ chain: robinhoodChain, transport: custom(provider), account });
    const factory = { address: LAUNCH_FACTORY, abi: launchFactoryAbi } as const;

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
    if (!allowed) throw new ChainError("Launching is currently limited to whitelisted creators on this launchpad.");
    if (BigInt(input.creatorTaxBps) > maxCreatorTaxBps) {
      throw new ChainError(`The launchpad caps the creator tax at ${Number(maxCreatorTaxBps) / 100}%.`);
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
    if (configId === null) throw new ChainError("No launch configuration is currently enabled.");
    // pin the quoted terms so an owner update cannot reprice this launch mid-flight
    const expectedEconomics = await withTimeout(
      publicClient.readContract({ ...factory, functionName: "previewLaunchEconomics", args: [configId, zeroAddress] }),
      30_000,
      NO_RPC,
    );

    const params = {
      name: input.name,
      symbol: input.ticker,
      logo: input.logo,
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

    // the launch fee alone must be covered before anything is sent
    const balance = await withTimeout(publicClient.getBalance({ address: account }), 30_000, NO_RPC);
    if (balance <= launchFee) throw notEnoughEth(launchFee, balance, account);

    // simulate first so a revert surfaces as a readable error, not a failed tx
    onStatus("checking the launch");
    let request;
    try {
      ({ request } = await withTimeout(
        simulateFunded(
          (gas) =>
            publicClient.simulateContract({
              ...factory,
              functionName: "launchToken",
              args: [params, configId, zeroAddress],
              value: launchFee,
              account,
              gas,
            }),
          LAUNCH_GAS_LIMIT,
        ),
        45_000,
        NO_RPC,
      ));
    } catch (err) {
      // still short once gas is priced realistically: the wallet really can't cover it
      if (isInsufficientFunds(err)) throw notEnoughEth(launchFee, balance, account);
      throw err;
    }

    onStatus("confirm the launch in your wallet");
    const hash = await walletClient.writeContract(request);

    onStatus("waiting for confirmation on Robinhood Chain");
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new ChainError("The launch transaction reverted.");

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== LAUNCH_FACTORY.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: launchFactoryAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "TokenLaunched") {
          return { token: ev.args.token, curve: ev.args.curve, hash, block: receipt.blockNumber, launchFee, baseFeeBps };
        }
      } catch {
        // not a factory event we know
      }
    }
    throw new ChainError("Launch confirmed, but the token address could not be read from the receipt.");
  } catch (err) {
    throw toChainError(err);
  }
}
