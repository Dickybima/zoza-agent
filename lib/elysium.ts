// HYPE bridge between HyperEVM and Elysium, Kinetiq's Arbitrum Orbit L2 that
// settles to HyperEVM and uses HYPE as native gas (docs: kinetiq.xyz/docs).
// This is the chain's canonical bridge, driven through the official Arbitrum
// SDK: deposits go through the rollup's Inbox on HyperEVM and arrive on
// Elysium within about a minute; withdrawals start on Elysium (ArbSys) and are
// claimed through the Outbox on HyperEVM once the challenge period has passed.
//
// Every contract address is read from the rollup contract itself, so a network
// needs only its rollup address and RPCs. Mainnet reads and sends through the
// Montra RPC, which carries plain HYPE withdrawals (ArbSys.withdrawEth); its
// rollup 0x508c…d217 is the one Elysium's Inbox on HyperEVM
// (0xce59…2cff) reports, checked on chain. Both can be overridden with
// NEXT_PUBLIC_ELYSIUM_MAINNET_RPC and NEXT_PUBLIC_ELYSIUM_MAINNET_ROLLUP.
import type { EIP1193Provider } from "viem";

export type ChainInfo = { chainId: number; name: string; rpc: string | null };
export type BridgeNetwork = {
  key: "mainnet" | "testnet";
  label: string;
  parent: ChainInfo;
  child: ChainInfo;
  rollup: string | null;
};

export const NETWORKS: Record<BridgeNetwork["key"], BridgeNetwork> = {
  mainnet: {
    key: "mainnet",
    label: "Mainnet",
    parent: { chainId: 999, name: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm" },
    child: { chainId: 99901, name: "Elysium", rpc: process.env.NEXT_PUBLIC_ELYSIUM_MAINNET_RPC || "https://rpc.montramarkets.xyz" },
    rollup: process.env.NEXT_PUBLIC_ELYSIUM_MAINNET_ROLLUP || "0x508c173dfe5f737b3493195bf785d71fa76fd217",
  },
  testnet: {
    key: "testnet",
    label: "Testnet",
    parent: { chainId: 998, name: "HyperEVM Testnet", rpc: "https://rpc.hyperliquid-testnet.xyz/evm" },
    child: { chainId: 99801, name: "Elysium Testnet", rpc: "https://testnet-rpc.elysium.kinetiq.xyz" },
    rollup: "0xEbf08e34941fd93a0Fc1cD89dbBF7447267039Df",
  },
};

/** Whether everything the network needs has been published. */
export const isConfigured = (n: BridgeNetwork) => !!(n.child.rpc && n.rollup && n.parent.rpc);

export class BridgeError extends Error {
  constructor(message: string, readonly rejected = false) {
    super(message);
  }
}

function toBridgeError(err: unknown): BridgeError {
  if (err instanceof BridgeError) return err;
  const e = err as { code?: number | string; message?: string; reason?: string; error?: { code?: number }; shortMessage?: string };
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED" || e?.error?.code === 4001) return new BridgeError("Cancelled in your wallet.", true);
  const msg = e?.reason || e?.shortMessage || e?.message || "Something went wrong.";
  if (/insufficient funds/i.test(msg)) return new BridgeError("Not enough HYPE to cover the amount plus gas.");
  return new BridgeError(msg.length > 220 ? msg.slice(0, 220) + "…" : msg);
}

/** Asks the wallet to switch to `chain`, adding it first if it doesn't know it. */
export async function switchWallet(provider: EIP1193Provider, chain: ChainInfo) {
  const chainId = `0x${chain.chainId.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 4001) throw new BridgeError(`Switching to ${chain.name} was rejected in your wallet.`, true);
    if (!chain.rpc) throw new BridgeError(`${chain.name} has no public RPC yet.`);
    await provider
      .request({
        method: "wallet_addEthereumChain",
        params: [{ chainId, chainName: chain.name, nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 }, rpcUrls: [chain.rpc] }],
      })
      .catch((e: { code?: number }) => {
        throw new BridgeError(e?.code === 4001 ? `Adding ${chain.name} was rejected in your wallet.` : `Couldn’t add ${chain.name} to your wallet.`, e?.code === 4001);
      });
  }
  const now = (await provider.request({ method: "eth_chainId" })) as string;
  if (parseInt(now, 16) !== chain.chainId) throw new BridgeError(`Your wallet is still on another network. Switch it to ${chain.name} and try again.`);
}

// the SDK and ethers v5 are only loaded on the bridge page, when first needed
async function libs() {
  const [sdk, ethers] = await Promise.all([import("@arbitrum/sdk"), import("ethers")]);
  return { sdk, ethers };
}

const registered = new Map<string, Promise<import("@arbitrum/sdk").ArbitrumNetwork>>();

/**
 * Registers the network with the SDK from its rollup contract, after checking
 * that both RPCs answer with the expected chain IDs.
 */
export function loadNetwork(net: BridgeNetwork) {
  if (!isConfigured(net)) return Promise.reject(new BridgeError(`${net.child.name} isn’t live on Zoza yet.`));
  const key = net.key;
  let p = registered.get(key);
  if (!p) {
    p = (async () => {
      const { sdk, ethers } = await libs();
      const parent = new ethers.providers.StaticJsonRpcProvider(net.parent.rpc!, net.parent.chainId);
      const child = new ethers.providers.StaticJsonRpcProvider(net.child.rpc!, net.child.chainId);
      const [pid, cid] = await Promise.all([parent.send("eth_chainId", []), child.send("eth_chainId", [])]);
      if (parseInt(pid, 16) !== net.parent.chainId || parseInt(cid, 16) !== net.child.chainId) {
        throw new BridgeError(`The configured RPCs don’t match ${net.parent.name} and ${net.child.name}. The bridge stays off.`);
      }
      const info = await sdk.getArbitrumNetworkInformationFromRollup(net.rollup!, parent);
      if (info.parentChainId !== net.parent.chainId) throw new BridgeError("The rollup doesn’t settle to the expected chain. The bridge stays off.");
      if (info.nativeToken && info.nativeToken !== ethers.constants.AddressZero) throw new BridgeError("This rollup doesn’t use HYPE as its native token.");
      return sdk.registerCustomArbitrumNetwork(
        { name: net.child.name, chainId: net.child.chainId, isTestnet: net.key === "testnet", isCustom: true, ...info },
        { throwIfAlreadyRegistered: false },
      );
    })();
    p.catch(() => registered.delete(key));
    registered.set(key, p);
  }
  return p;
}

export type Balances = { parent: bigint; child: bigint };

/** HYPE on both sides for `address`, read straight from each chain's RPC. */
export async function readBalances(net: BridgeNetwork, address: string): Promise<Balances> {
  const { ethers } = await libs();
  const read = async (c: ChainInfo) => {
    if (!c.rpc) return BigInt(0);
    const p = new ethers.providers.StaticJsonRpcProvider(c.rpc, c.chainId);
    return BigInt((await p.getBalance(address)).toString());
  };
  const [parent, child] = await Promise.all([read(net.parent), read(net.child)]);
  return { parent, child };
}

/** Deposits `amount` wei of HYPE from HyperEVM to the same address on Elysium. */
export async function depositHype(provider: EIP1193Provider, net: BridgeNetwork, amount: bigint, onStatus: (s: string) => void) {
  try {
    const network = await loadNetwork(net);
    const { sdk, ethers } = await libs();
    onStatus(`switching wallet to ${net.parent.name}`);
    await switchWallet(provider, net.parent);
    const signer = new ethers.providers.Web3Provider(provider as never, "any").getSigner();
    const bridger = new sdk.EthBridger(network);
    onStatus("confirm the deposit in your wallet");
    const tx = await bridger.deposit({ amount: ethers.BigNumber.from(amount.toString()), parentSigner: signer });
    onStatus(`waiting for ${net.parent.name} to confirm`);
    await tx.wait();
    return tx.hash;
  } catch (err) {
    throw toBridgeError(err);
  }
}

/** Whether a deposit's HYPE has landed on Elysium yet. */
export async function depositArrived(net: BridgeNetwork, parentTxHash: string): Promise<{ arrived: boolean; childTx?: string }> {
  const network = await loadNetwork(net);
  const { sdk, ethers } = await libs();
  const parent = new ethers.providers.StaticJsonRpcProvider(net.parent.rpc!, net.parent.chainId);
  const child = new ethers.providers.StaticJsonRpcProvider(net.child.rpc!, net.child.chainId);
  void network;
  const receipt = await parent.getTransactionReceipt(parentTxHash);
  if (!receipt) return { arrived: false };
  const [msg] = await new sdk.ParentTransactionReceipt(receipt).getEthDeposits(child);
  if (!msg) return { arrived: false };
  const childReceipt = await child.getTransactionReceipt(msg.childTxHash);
  return { arrived: !!childReceipt && childReceipt.status === 1, childTx: msg.childTxHash };
}

/** Starts a withdrawal of `amount` wei of HYPE from Elysium back to HyperEVM. */
export async function withdrawHype(provider: EIP1193Provider, net: BridgeNetwork, from: string, amount: bigint, onStatus: (s: string) => void) {
  try {
    const network = await loadNetwork(net);
    const { sdk, ethers } = await libs();
    onStatus(`switching wallet to ${net.child.name}`);
    await switchWallet(provider, net.child);
    const signer = new ethers.providers.Web3Provider(provider as never, "any").getSigner();
    const bridger = new sdk.EthBridger(network);
    onStatus("confirm the withdrawal in your wallet");
    const tx = await bridger.withdraw({ amount: ethers.BigNumber.from(amount.toString()), destinationAddress: from, from, childSigner: signer });
    onStatus(`waiting for ${net.child.name} to confirm`);
    await tx.wait();
    return tx.hash;
  } catch (err) {
    throw toBridgeError(err);
  }
}

export type WithdrawalStatus = {
  state: "waiting" | "ready" | "claimed";
  /** HYPE being withdrawn, in wei */
  amount: bigint;
  /** rough seconds left in the challenge period while waiting */
  etaSeconds?: number;
};

// The SDK's own status check scans the rollup's logs from the last confirmed
// assertion to the head, which on mainnet spans the whole ~5.5-day challenge
// period: far past HyperEVM's 1,000-block getLogs limit. So the status is
// worked out directly instead, with single-block queries: spent in the Outbox
// means claimed; a position below the last confirmed assertion's send count
// means ready; anything else is still inside the challenge period.
const L2_TO_L1 = "0x0000000000000000000000000000000000000064";

async function confirmedSendCount(net: BridgeNetwork) {
  const network = await loadNetwork(net);
  const { ethers } = await libs();
  const { BoldRollupUserLogic__factory } = await import("@arbitrum/sdk/dist/lib/abi-bold/factories/BoldRollupUserLogic__factory");
  const parent = new ethers.providers.StaticJsonRpcProvider(net.parent.rpc!, net.parent.chainId);
  const child = new ethers.providers.StaticJsonRpcProvider(net.child.rpc!, net.child.chainId);
  const rollup = BoldRollupUserLogic__factory.connect(network.ethBridge.rollup, parent);
  const latest = await rollup.latestConfirmed();
  const created = (await rollup.getAssertion(latest)).createdAtBlock.toNumber();
  const [log] = await parent.getLogs({ address: rollup.address, topics: [rollup.interface.getEventTopic("AssertionCreated"), latest], fromBlock: created, toBlock: created });
  if (!log) throw new BridgeError("Couldn’t read the rollup’s confirmed state.");
  const blockHash = rollup.interface.parseLog(log).args.assertion.afterState.globalState.bytes32Vals[0];
  const block = await child.send("eth_getBlockByHash", [blockHash, false]);
  return { sendCount: BigInt(block.sendCount), confirmPeriod: (await rollup.confirmPeriodBlocks()).toNumber() };
}

/** Where a withdrawal stands: inside the challenge period, ready to claim, or claimed. */
export async function withdrawalStatus(net: BridgeNetwork, childTxHash: string): Promise<WithdrawalStatus> {
  const network = await loadNetwork(net);
  const { sdk, ethers } = await libs();
  const parent = new ethers.providers.StaticJsonRpcProvider(net.parent.rpc!, net.parent.chainId);
  const child = new ethers.providers.StaticJsonRpcProvider(net.child.rpc!, net.child.chainId);
  const receipt = await child.getTransactionReceipt(childTxHash);
  if (!receipt) return { state: "waiting", amount: BigInt(0) };
  const [event] = new sdk.ChildTransactionReceipt(receipt).getChildToParentEvents();
  // Nitro chains emit L2ToL1Tx (with a position); the classic event shape never occurs here
  if (!event || !("position" in event)) throw new BridgeError("That transaction has no withdrawal in it.");
  const amount = BigInt(event.callvalue.toString());
  const position = BigInt(event.position.toString());
  const outbox = new ethers.Contract(network.ethBridge.outbox, ["function isSpent(uint256) view returns (bool)"], parent);
  if (await outbox.isSpent(event.position)) return { state: "claimed", amount };
  const { sendCount, confirmPeriod } = await confirmedSendCount(net);
  if (position < sendCount) return { state: "ready", amount };
  // HyperEVM's small blocks land about once a second; assertions are posted
  // on a cadence too, so this is an estimate
  const head = await parent.getBlockNumber();
  const readyAt = event.ethBlockNum.toNumber() + confirmPeriod;
  return { state: "waiting", amount, etaSeconds: Math.max(0, readyAt - head) };
}

/** Recent withdrawals made by `address` from Elysium, newest first (bounded scan). */
export async function findWithdrawals(net: BridgeNetwork, address: string, blocks = 200_000): Promise<string[]> {
  await loadNetwork(net);
  const { ethers } = await libs();
  const child = new ethers.providers.StaticJsonRpcProvider(net.child.rpc!, net.child.chainId);
  const head = await child.getBlockNumber();
  const topic = ethers.utils.id("L2ToL1Tx(address,address,uint256,uint256,uint256,uint256,uint256,uint256,bytes)");
  // L2ToL1Tx(caller, destination indexed, ...): filter on the destination
  const dest = ethers.utils.hexZeroPad(address, 32);
  const logs = await child.getLogs({ address: L2_TO_L1, topics: [topic, dest], fromBlock: Math.max(0, head - blocks), toBlock: head });
  return [...new Set(logs.map((l) => l.transactionHash))].reverse();
}

/** Claims a confirmed withdrawal on HyperEVM, paying the HYPE out. */
export async function claimWithdrawal(provider: EIP1193Provider, net: BridgeNetwork, childTxHash: string, onStatus: (s: string) => void) {
  try {
    await loadNetwork(net);
    const { sdk, ethers } = await libs();
    onStatus(`switching wallet to ${net.parent.name}`);
    await switchWallet(provider, net.parent);
    const signer = new ethers.providers.Web3Provider(provider as never, "any").getSigner();
    const child = new ethers.providers.StaticJsonRpcProvider(net.child.rpc!, net.child.chainId);
    const receipt = await child.getTransactionReceipt(childTxHash);
    const [msg] = await new sdk.ChildTransactionReceipt(receipt).getChildToParentMessages(signer);
    onStatus("confirm the claim in your wallet");
    const tx = await msg.execute(child);
    onStatus(`waiting for ${net.parent.name} to confirm`);
    await tx.wait();
    return tx.hash;
  } catch (err) {
    throw toBridgeError(err);
  }
}
