// Creator fees on Montra. Every trade in a Montra pool books the creator
// side's share of the fee (in HYPE) in the pool's hook, until the pool's
// recipient (the launching wallet, for Zoza launches) claims it with
// `claim(poolId, to)` on the hook. LaunchLens.creatorClaimable says what a
// claim would pay right now (montramarkets.xyz/docs/reference).
import type { Address, Hex } from "viem";

import { creatorClaimable, fetchPool } from "@/lib/montra";
import { montraTokenAbi } from "@/lib/montra-abi";
import { NO_RPC, readClient, withTimeout } from "@/lib/rpc";

type Client = ReturnType<typeof readClient>;

export type CreatorToken = {
  token: Address;
  name: string;
  symbol: string;
  logo?: string;
  hook: Address;
  poolId: Hex;
  /** who the pool's creator fees pay */
  recipient: Address;
  /** what a claim would pay now, in HYPE wei */
  claimable: bigint;
};

/** A token's pool and the creator fees waiting in it. */
export async function readCreatorToken(client: Client, token: Address): Promise<CreatorToken> {
  const t = { address: token, abi: montraTokenAbi } as const;
  const [name, symbol, pool] = await withTimeout(
    Promise.all([client.readContract({ ...t, functionName: "name" }), client.readContract({ ...t, functionName: "symbol" }), fetchPool(client, token)]),
    30_000,
    NO_RPC,
  );
  const claimable = await creatorClaimable(client, pool);
  return { token, name, symbol, hook: pool.hook, poolId: pool.poolId, recipient: pool.recipient, claimable };
}
