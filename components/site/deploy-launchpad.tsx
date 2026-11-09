"use client";

import { useEffect, useState } from "react";
import { ArrowUpRightIcon, CheckIcon, CopyIcon, LoaderIcon } from "lucide-react";
import { createWalletClient, custom, formatEther, getAddress, parseEther } from "viem";
import type { Address } from "viem";

import { shortAddr } from "@/lib/agent";
import { CHAIN_NAME, IS_TESTNET, NATIVE, explorerAddress, explorerTx, zozaChain } from "@/lib/chain";
import { LAUNCHPAD_LIVE, LAUNCH_FACTORY } from "@/lib/launchpad";
import { ChainError, NO_RPC, ensureChain, readClient, toChainError, withTimeout } from "@/lib/rpc";
import { useWallet } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, SectionHeading } from "@/components/site/section";

type Live = { owner: Address; treasury: Address; launchFee: bigint; escrow: Address; tokens: bigint };
type State =
  | { kind: "idle" }
  | { kind: "busy"; status: string }
  | { kind: "done"; factory: Address; tx: string }
  | { kind: "error"; message: string };

const NUM = /^\d+(\.\d+)?$/;

/**
 * One-time setup: deploys Zoza's launch factory (contracts/ZozaLaunchpad.sol)
 * to Elysium from the connected wallet, which becomes its owner and treasury.
 * The site then needs the address in NEXT_PUBLIC_ZOZA_FACTORY.
 */
export function DeployLaunchpad() {
  const { address, connect, getProvider } = useWallet();
  const [fee, setFee] = useState("0");
  const [virtualHype, setVirtualHype] = useState("100");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [live, setLive] = useState<Live | null>(null);
  const [copied, setCopied] = useState(false);

  // when a factory is configured, show what's deployed there
  useEffect(() => {
    if (!LAUNCHPAD_LIVE) return;
    let alive = true;
    (async () => {
      const { FACTORY_ABI } = await import("@/lib/launchpad-artifact");
      const client = readClient();
      const f = { address: LAUNCH_FACTORY, abi: FACTORY_ABI } as const;
      try {
        const [owner, treasury, launchFee, escrow, tokens] = await Promise.all([
          client.readContract({ ...f, functionName: "owner" }),
          client.readContract({ ...f, functionName: "treasury" }),
          client.readContract({ ...f, functionName: "launchFee" }),
          client.readContract({ ...f, functionName: "feeEscrow" }),
          client.readContract({ ...f, functionName: "tokenCount" }),
        ]);
        if (alive) setLive({ owner, treasury, launchFee, escrow, tokens });
      } catch {
        // shown as "not reachable" below
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const valid = NUM.test(fee.trim()) && NUM.test(virtualHype.trim()) && Number(virtualHype) > 0;
  const busy = state.kind === "busy";

  const deploy = async () => {
    try {
      const wallet = address ?? (await connect());
      const provider = getProvider();
      if (!wallet || !provider) throw new ChainError("Connect a wallet first.");
      const account = getAddress(wallet.toLowerCase());
      const onStatus = (status: string) => setState({ kind: "busy", status });

      onStatus(`switching wallet to ${CHAIN_NAME}`);
      await ensureChain(provider);
      const { FACTORY_ABI, FACTORY_BYTECODE } = await import("@/lib/launchpad-artifact");
      const client = readClient(provider);
      const walletClient = createWalletClient({ chain: zozaChain, transport: custom(provider), account });
      const args = [parseEther(fee.trim()), parseEther(virtualHype.trim())] as const;

      onStatus("checking your balance");
      const balance = await withTimeout(client.getBalance({ address: account }), 30_000, NO_RPC);
      if (balance === BigInt(0)) {
        throw new ChainError(`This wallet has no ${NATIVE} on ${CHAIN_NAME} for gas. Bridge some in from the Bridge page first.`);
      }

      onStatus("confirm the deployment in your wallet");
      const hash = await walletClient.deployContract({ abi: FACTORY_ABI, bytecode: FACTORY_BYTECODE, args, chain: zozaChain, account });
      onStatus(`waiting for confirmation on ${CHAIN_NAME}`);
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
      if (receipt.status !== "success" || !receipt.contractAddress) throw new ChainError("The deployment reverted.");
      setState({ kind: "done", factory: receipt.contractAddress, tx: hash });
    } catch (err) {
      const e = toChainError(err);
      setState({ kind: "error", message: e.rejected ? "Cancelled in your wallet." : e.message });
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <Section>
      <SectionHeading index="00" label="Setup" title={`Deploy the Zoza launchpad on ${CHAIN_NAME}.`}>
        A one-time step for the Zoza team. It deploys Zoza’s launch factory from your wallet, which becomes its owner and
        receives launch and protocol fees. Then the site is pointed at it.
      </SectionHeading>

      {LAUNCHPAD_LIVE ? (
        <div className="mb-8 border border-signal/50 bg-signal/5 p-5 text-sm">
          <p className="font-semibold text-signal">Launchpad is live on {CHAIN_NAME}</p>
          <dl className="mt-3 space-y-1.5 text-xs">
            {[
              ["factory", LAUNCH_FACTORY],
              ["owner", live ? live.owner : "…"],
              ["treasury", live ? live.treasury : "…"],
              ["fee escrow", live ? live.escrow : "…"],
              ["launch fee", live ? `${formatEther(live.launchFee)} ${NATIVE}` : "…"],
              ["tokens launched", live ? live.tokens.toString() : "…"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-3">
                <dt className="w-32 text-muted-foreground">{k}</dt>
                <dd className="break-all">{/^0x[0-9a-fA-F]{40}$/.test(v) ? <a className="hover:text-signal" href={explorerAddress(v)} target="_blank" rel="noopener noreferrer">{v}</a> : v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5 border border-border p-5">
          <label className="block space-y-2 text-sm">
            <span className="text-muted-foreground">launch fee ({NATIVE}, paid to you per launch)</span>
            <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" disabled={busy} />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="text-muted-foreground">starting virtual reserve ({NATIVE}): a new token’s starting market cap</span>
            <Input value={virtualHype} onChange={(e) => setVirtualHype(e.target.value)} inputMode="decimal" disabled={busy} />
          </label>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>› supply per token: 1,000,000,000, all on the bonding curve</li>
            <li>› trade fees: 1% to the protocol (you) + the creator’s 2% tax</li>
            <li>› creator tax capped at 5%; fees can be changed later by the owner</li>
            <li>› network: {CHAIN_NAME} (chain ID {zozaChain.id}){IS_TESTNET ? " · testnet" : ""}</li>
          </ul>
          <Button variant="signal" className="w-full" onClick={deploy} disabled={!valid || busy}>
            {busy ? <LoaderIcon className="animate-spin" /> : null}
            {address ? `Deploy from ${shortAddr(address)}` : "Connect wallet & deploy"}
          </Button>
          {state.kind === "busy" ? <p className="text-xs text-muted-foreground">› {state.status}…</p> : null}
          {state.kind === "error" ? <p className="text-xs text-destructive">{state.message}</p> : null}
        </div>

        <div className="border border-border p-5 text-sm">
          {state.kind === "done" ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 font-semibold text-signal">
                <CheckIcon className="size-4" /> Launchpad deployed
              </p>
              <div className="flex items-center gap-2 border border-border bg-card/50 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 break-all">{state.factory}</span>
                <Button variant="outline" size="sm" onClick={() => copy(state.factory)}>
                  <CopyIcon /> {copied ? "Copied ✓" : "Copy"}
                </Button>
              </div>
              <a className="inline-flex items-center gap-1 text-xs hover:text-signal" href={explorerTx(state.tx)} target="_blank" rel="noopener noreferrer">
                deployment transaction <ArrowUpRightIcon className="size-3" />
              </a>
              <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
                <li>In Vercel → Settings → Environment Variables, add <code className="text-foreground">NEXT_PUBLIC_ZOZA_FACTORY</code> = the address above.</li>
                <li>Redeploy the site. Launch, Explore, Terminal, Portfolio and Claim switch on.</li>
              </ol>
            </div>
          ) : (
            <div className="space-y-3 text-xs text-muted-foreground">
              <p className="text-sm text-foreground">What happens</p>
              <p>1. Your wallet switches to {CHAIN_NAME} and asks you to confirm one contract deployment (gas in {NATIVE}).</p>
              <p>2. The factory goes live, with its own fee escrow. Your wallet owns it.</p>
              <p>
                3. Put the factory address in <code className="text-foreground">NEXT_PUBLIC_ZOZA_FACTORY</code> on Vercel and redeploy.
              </p>
              <p>The contracts haven’t had a third-party audit. Start on testnet.</p>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
