// Creator fees. Every trade on a bonding curve books its creator tax (plus the
// creator's share of the base fee) on the curve itself; `sweepFees` moves that
// into the launchpad's shared fee escrow (anyone may call it; the money only
// goes to the creator and the protocol). `claim()` on the escrow then sends
// the whole HYPE balance to the creator's wallet.
import { createWalletClient, custom, getAddress, parseAbi } from "viem";
import type { Address, EIP1193Provider, Hash } from "viem";

import { CHAIN_NAME, zozaChain } from "@/lib/chain";
import { launchedTokenAbi } from "@/lib/curve";
import { LAUNCHPAD_LIVE, LAUNCH_FACTORY, NOT_DEPLOYED, launchFactoryAbi } from "@/lib/launchpad";
import { ChainError, NO_RPC, ensureChain, readClient, simulateFunded, toChainError, withTimeout } from "@/lib/rpc";

export const feeEscrowAbi = parseAbi([
  "function balanceOf(address recipient) view returns (uint256)",
  "function claim() returns (uint256 amount)",
]);
const factoryEscrowAbi = parseAbi(["function feeEscrow() view returns (address)"]);
export const curveFeeAbi = parseAbi([
  "function deployer() view returns (address)",
  "function graduated() view returns (bool)",
  "function quoteFeeBalance() view returns (uint256)",
  "function creatorTaxBalance() view returns (uint256)",
  "function buybackQuoteBalance() view returns (uint256)",
  "function protocolFeeShareBps() view returns (uint16)",
  "function sweepFees(uint256 minBuybackTokensOut)",
]);

type Client = ReturnType<typeof readClient>;
const BPS = BigInt(10_000);
const ZERO = BigInt(0);
// sweeping pays out to the escrow; claiming is a single transfer
const FEE_GAS_LIMIT = BigInt(1_500_000);

export type CreatorToken = {
  token: Address;
  name: string;
  symbol: string;
  curve: Address;
  /** who the curve pays creator fees to */
  recipient: Address;
  graduated: boolean;
  /** creator fees still held on the curve, in wei */
  pending: bigint;
  /** whether the creator can sweep them now (no buyback awaiting the operator) */
  sweepable: boolean;
};

export async function feeEscrowAddress(client: Client): Promise<Address> {
  if (!LAUNCHPAD_LIVE) throw new ChainError(NOT_DEPLOYED);
  return withTimeout(client.readContract({ address: LAUNCH_FACTORY, abi: factoryEscrowAbi, functionName: "feeEscrow" }), 30_000, NO_RPC);
}

/** HYPE waiting in the escrow for `wallet`, ready to claim. */
export async function claimableBalance(client: Client, escrow: Address, wallet: Address): Promise<bigint> {
  return withTimeout(client.readContract({ address: escrow, abi: feeEscrowAbi, functionName: "balanceOf", args: [wallet] }), 30_000, NO_RPC);
}

/** A token's curve and the creator fees it is holding. */
export async function readCreatorToken(client: Client, token: Address): Promise<CreatorToken> {
  const t = { address: token, abi: launchedTokenAbi } as const;
  const [name, symbol, curve] = await withTimeout(
    Promise.all([
      client.readContract({ ...t, functionName: "name" }),
      client.readContract({ ...t, functionName: "symbol" }),
      client.readContract({ ...t, functionName: "curve" }),
    ]),
    30_000,
    NO_RPC,
  );
  const c = { address: curve, abi: curveFeeAbi } as const;
  const [recipient, graduated, fee, tax, buyback, shareBps] = await withTimeout(
    Promise.all([
      client.readContract({ ...c, functionName: "deployer" }),
      client.readContract({ ...c, functionName: "graduated" }),
      client.readContract({ ...c, functionName: "quoteFeeBalance" }),
      client.readContract({ ...c, functionName: "creatorTaxBalance" }),
      client.readContract({ ...c, functionName: "buybackQuoteBalance" }),
      client.readContract({ ...c, functionName: "protocolFeeShareBps" }),
    ]),
    30_000,
    NO_RPC,
  );
  // mirrors the curve's split: the tax goes to the creator in full, the base
  // fee after the protocol's share and any buyback earmark
  const creatorBucket = fee - (fee * BigInt(shareBps)) / BPS;
  const pending = graduated ? ZERO : tax + (creatorBucket > buyback ? creatorBucket - buyback : ZERO);
  return { token, name, symbol, curve, recipient, graduated, pending, sweepable: !graduated && buyback === ZERO };
}

/** Tokens launched from `wallet`, oldest first, from the factory's registry. */
export async function findLaunchesBy(client: Client, wallet: Address): Promise<Address[]> {
  if (!LAUNCHPAD_LIVE) return [];
  const list = await withTimeout(
    client.readContract({ address: LAUNCH_FACTORY, abi: launchFactoryAbi, functionName: "tokensBy", args: [wallet] }),
    30_000,
    NO_RPC,
  );
  return [...list];
}

async function send(
  provider: EIP1193Provider,
  wallet: string,
  call: { address: Address; abi: typeof curveFeeAbi | typeof feeEscrowAbi; functionName: "sweepFees" | "claim"; args?: readonly [bigint] },
  what: string,
  onStatus: (status: string) => void,
): Promise<Hash> {
  try {
    const account = getAddress(wallet.toLowerCase());
    onStatus(`switching wallet to ${CHAIN_NAME}`);
    await ensureChain(provider);
    const client = readClient(provider);
    const walletClient = createWalletClient({ chain: zozaChain, transport: custom(provider), account });
    onStatus(`checking the ${what}`);
    const { request } = await withTimeout(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      simulateFunded((gas) => client.simulateContract({ ...(call as any), account, gas }), FEE_GAS_LIMIT),
      45_000,
      NO_RPC,
    );
    onStatus(`confirm the ${what} in your wallet`);
    const hash = await walletClient.writeContract(request);
    onStatus("waiting for confirmation");
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new ChainError(`The ${what} reverted.`);
    return hash;
  } catch (err) {
    throw toChainError(err);
  }
}

/** Moves a curve's pending creator fees into the escrow. */
export const sweepCreatorFees = (provider: EIP1193Provider, wallet: string, curve: Address, onStatus: (s: string) => void) =>
  send(provider, wallet, { address: curve, abi: curveFeeAbi, functionName: "sweepFees", args: [ZERO] }, "fee collection", onStatus);

/** Sends the wallet's whole escrow balance to it. */
export const claimFees = (provider: EIP1193Provider, wallet: string, escrow: Address, onStatus: (s: string) => void) =>
  send(provider, wallet, { address: escrow, abi: feeEscrowAbi, functionName: "claim" }, "claim", onStatus);
