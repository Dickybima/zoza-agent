// Token launches. Zoza launches every token on Montra, Elysium's launchpad
// (lib/montra.ts): one transaction creates the token, its Uniswap v4 pool and
// its locked liquidity, and the creator's fee share goes to the launching wallet.
export { launchOnMontra as launchToken } from "@/lib/montra";
export type { LaunchInput, LaunchResult } from "@/lib/montra";
export { ChainError as LaunchError } from "@/lib/rpc";
