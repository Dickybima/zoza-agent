"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUpIcon, CheckIcon, CopyIcon, LoaderIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { formatEther, parseEther } from "viem";

import {
  NETWORKS,
  claimWithdrawal,
  depositArrived,
  depositHype,
  findWithdrawals,
  isConfigured,
  loadNetwork,
  readBalances,
  withdrawHype,
  withdrawalStatus,
} from "@/lib/elysium";
import type { Balances, BridgeError, BridgeNetwork, WithdrawalStatus } from "@/lib/elysium";
import { shortAddr } from "@/lib/agent";
import { pageHidden } from "@/lib/visible";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, SectionHeading } from "@/components/site/section";

type Direction = "deposit" | "withdraw";
type Entry = { kind: Direction; tx: string; amount: string; at: number; net: BridgeNetwork["key"]; owner: string };
type Live = { arrived?: boolean; status?: WithdrawalStatus; error?: string };

const STORE = "zoza.bridge.v1";
const POLL_MS = 20_000;
// left behind on MAX so the bridge transaction itself can pay for gas
const GAS_BUFFER = parseEther("0.002");

const readEntries = (): Entry[] => {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "[]");
  } catch {
    return [];
  }
};
const writeEntries = (list: Entry[]) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(list.slice(0, 100)));
  } catch {
    // private mode: history lasts for this visit only
  }
};

const fmt = (wei: bigint, max = 6) => Number(formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: max });
const eta = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `~${Math.round(s / 60)} min` : s < 172800 ? `~${Math.round(s / 3600)} h` : `~${(s / 86400).toFixed(1)} days`);

export function Bridge() {
  const { address, openPicker, getProvider } = useWallet();
  const [netKey, setNetKey] = useState<BridgeNetwork["key"]>(isConfigured(NETWORKS.mainnet) ? "mainnet" : "testnet");
  const net = NETWORKS[netKey];
  const live = isConfigured(net);
  const [direction, setDirection] = useState<Direction>("deposit");
  const [amount, setAmount] = useState("");
  const [balances, setBalances] = useState<Balances | null>(null);
  const [ready, setReady] = useState<"checking" | "ok" | "error">("checking");
  const [readyError, setReadyError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [liveState, setLiveState] = useState<Record<string, Live>>({});
  const [scanning, setScanning] = useState(false);
  const [tick, setTick] = useState(0);

  const from = direction === "deposit" ? net.parent : net.child;
  const to = direction === "deposit" ? net.child : net.parent;
  const fromBalance = balances ? (direction === "deposit" ? balances.parent : balances.child) : null;

  // load saved activity once on the client
  useEffect(() => {
    const t = setTimeout(() => setEntries(readEntries()), 0);
    return () => clearTimeout(t);
  }, []);

  // check the network is reachable and its rollup reads back correctly
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      if (!live) return;
      setReady("checking");
      try {
        await loadNetwork(net);
        if (alive) setReady("ok");
      } catch (err) {
        if (alive) {
          setReady("error");
          setReadyError((err as Error).message);
        }
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [net, live]);

  const mine = useMemo(
    () => entries.filter((e) => e.net === netKey && !!address && e.owner.toLowerCase() === address.toLowerCase()),
    [entries, netKey, address],
  );

  // balances and the status of every pending transfer, refreshed while the tab is visible
  useEffect(() => {
    if (!address || ready !== "ok") return;
    let alive = true;
    const t = setTimeout(async () => {
      if (tick > 0 && pageHidden()) return;
      readBalances(net, address).then((b) => alive && setBalances(b)).catch(() => {});
      for (const e of mine) {
        const prev = liveState[e.tx];
        if (prev?.arrived || prev?.status?.state === "claimed") continue;
        try {
          const next: Live =
            e.kind === "deposit" ? { arrived: (await depositArrived(net, e.tx)).arrived } : { status: await withdrawalStatus(net, e.tx) };
          if (alive) setLiveState((s) => ({ ...s, [e.tx]: next }));
        } catch (err) {
          if (alive) setLiveState((s) => ({ ...s, [e.tx]: { ...s[e.tx], error: (err as Error).message } }));
        }
      }
    }, 0);
    const next = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => {
      alive = false;
      clearTimeout(t);
      clearTimeout(next);
    };
    // liveState is read only to skip settled transfers; re-running on it would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, ready, net, mine, tick]);

  const remember = (e: Entry) => {
    const list = [e, ...readEntries().filter((x) => x.tx !== e.tx)];
    writeEntries(list);
    setEntries(list);
  };

  let wei: bigint | null = null;
  try {
    wei = amount.trim() ? parseEther(amount.trim() as `${number}`) : null;
  } catch {
    wei = null;
  }
  const problem =
    !amount.trim() ? null : wei === null || wei <= BigInt(0) ? "Enter an amount of HYPE." : fromBalance !== null && wei > fromBalance ? `You only have ${fmt(fromBalance)} HYPE on ${from.name}.` : null;

  const run = async (label: string, job: (onStatus: (s: string) => void) => Promise<void>) => {
    setMessage(null);
    setBusy(label);
    try {
      await job((s) => setBusy(s));
    } catch (err) {
      const e = err as BridgeError;
      setMessage({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
      setTick((n) => n + 1);
    }
  };

  const submit = () => {
    const provider = getProvider();
    if (!address || !provider) return openPicker();
    if (!wei || problem) return;
    const value = wei;
    run("starting", async (onStatus) => {
      if (direction === "deposit") {
        const tx = await depositHype(provider, net, value, onStatus);
        remember({ kind: "deposit", tx, amount: value.toString(), at: Date.now(), net: netKey, owner: address });
        setMessage({ kind: "ok", text: `Deposit sent. ${fmt(value)} HYPE arrives on ${net.child.name} in about a minute.` });
      } else {
        const tx = await withdrawHype(provider, net, address, value, onStatus);
        remember({ kind: "withdraw", tx, amount: value.toString(), at: Date.now(), net: netKey, owner: address });
        setMessage({
          kind: "ok",
          text: `Withdrawal started. Claim ${fmt(value)} HYPE on ${net.parent.name} once the challenge period ends; it’s tracked below.`,
        });
      }
      setAmount("");
    });
  };

  const claim = (e: Entry) => {
    const provider = getProvider();
    if (!provider) return openPicker();
    run("claiming", async (onStatus) => {
      await claimWithdrawal(provider, net, e.tx, onStatus);
      setLiveState((s) => ({ ...s, [e.tx]: { status: { state: "claimed", amount: BigInt(e.amount) } } }));
      setMessage({ kind: "ok", text: `Claimed ${fmt(BigInt(e.amount))} HYPE on ${net.parent.name}.` });
    });
  };

  // recover withdrawals started elsewhere (another browser or device)
  const scan = useCallback(async () => {
    if (!address) return;
    setScanning(true);
    try {
      const txs = await findWithdrawals(net, address);
      const known = new Set(readEntries().map((e) => e.tx));
      let list = readEntries();
      for (const tx of txs.slice(0, 20)) {
        if (known.has(tx)) continue;
        const st = await withdrawalStatus(net, tx);
        list = [{ kind: "withdraw" as const, tx, amount: st.amount.toString(), at: Date.now(), net: netKey, owner: address }, ...list];
        setLiveState((s) => ({ ...s, [tx]: { status: st } }));
      }
      writeEntries(list);
      setEntries(list);
      setMessage({ kind: "ok", text: txs.length ? `Found ${txs.length} withdrawal${txs.length > 1 ? "s" : ""} from this wallet.` : "No recent withdrawals from this wallet." });
    } catch (err) {
      setMessage({ kind: "err", text: (err as Error).message });
    } finally {
      setScanning(false);
    }
  }, [address, net, netKey]);

  const max = () => {
    if (fromBalance === null) return;
    const v = fromBalance > GAS_BUFFER ? fromBalance - GAS_BUFFER : BigInt(0);
    setAmount(formatEther(v));
  };

  return (
    <Section>
      <SectionHeading index="10" label="Bridge" title="Move HYPE between HyperEVM and Elysium.">
        Elysium’s canonical bridge, built in. Deposits land on Elysium in about a minute; withdrawals return to HyperEVM after the
        rollup’s challenge period, then you claim them here.
      </SectionHeading>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Network" className="flex border border-border">
          {(Object.keys(NETWORKS) as BridgeNetwork["key"][]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={netKey === k}
              onClick={() => {
                setNetKey(k);
                setBalances(null);
                setMessage(null);
              }}
              className={cn(
                "px-4 py-2 text-sm transition-colors not-last:border-r not-last:border-border",
                netKey === k ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {NETWORKS[k].label}
              {!isConfigured(NETWORKS[k]) ? <span className="ml-1.5 text-[10px] uppercase opacity-70">soon</span> : null}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {net.parent.name} ({net.parent.chainId}) ⇄ {net.child.name} ({net.child.chainId})
        </span>
      </div>

      {!live ? (
        <div className="mb-6 border border-dashed border-signal/50 bg-signal/5 px-4 py-4 text-sm leading-relaxed">
          <p className="font-semibold text-signal">Elysium mainnet bridging switches on at launch.</p>
          <p className="mt-1 text-muted-foreground">
            Kinetiq publishes Elysium mainnet’s public RPC and rollup contracts at launch, and Zoza only bridges through contracts it can
            verify on-chain. Until then, try the full flow on Testnet.
          </p>
        </div>
      ) : ready === "error" ? (
        <p className="mb-6 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{readyError}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        {/* transfer */}
        <div className={cn("border border-border bg-card/50", (!live || ready !== "ok") && "pointer-events-none opacity-50")}>
          <div className="space-y-3 p-5 sm:p-6">
            <Side label="from" chain={from.name} balance={fromBalance} />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setDirection((d) => (d === "deposit" ? "withdraw" : "deposit"))}
                aria-label="Switch direction"
                className="grid size-10 place-items-center border border-border bg-background transition-colors hover:border-signal hover:text-signal"
              >
                <ArrowDownUpIcon className="size-4" />
              </button>
            </div>
            <Side label="to" chain={to.name} balance={balances ? (direction === "deposit" ? balances.child : balances.parent) : null} />

            <div className="pt-2">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>amount</span>
                {fromBalance !== null ? (
                  <button type="button" onClick={max} className="hover:text-foreground">
                    max {fmt(fromBalance > GAS_BUFFER ? fromBalance - GAS_BUFFER : BigInt(0), 4)}
                  </button>
                ) : null}
              </div>
              <div className="relative">
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.0" className="pr-16 text-lg" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">HYPE</span>
              </div>
            </div>

            <dl className="space-y-1.5 border-t border-dashed border-border pt-4 text-xs">
              <Row k="you receive" v={wei && !problem ? `${fmt(wei)} HYPE on ${to.name}` : "—"} />
              <Row k="arrives" v={direction === "deposit" ? "about a minute" : "after the challenge period, then claim"} />
              <Row k="route" v={direction === "deposit" ? "rollup Inbox on HyperEVM" : "ArbSys on Elysium → Outbox on HyperEVM"} />
            </dl>

            <Button variant="signal" size="lg" className="mt-2 w-full" onClick={submit} disabled={!!busy || (!!address && (!wei || !!problem))}>
              {busy ? <LoaderIcon className="animate-spin" /> : null}
              {!address ? "Connect wallet" : busy ? "Working…" : direction === "deposit" ? `Bridge to ${net.child.name}` : `Withdraw to ${net.parent.name}`}
            </Button>
            <p role="status" className={cn("min-h-4 text-xs", message?.kind === "err" ? "text-destructive" : message ? "text-signal" : "text-muted-foreground")}>
              {busy ? `› ${busy}…` : message ? message.text : problem ?? (direction === "withdraw" ? "Withdrawals are two steps: start here, claim on HyperEVM later." : "")}
            </p>
          </div>
        </div>

        {/* activity */}
        <div className="border border-border">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground">
            <span className="text-foreground">your transfers</span>
            {address ? (
              <button type="button" onClick={scan} disabled={scanning || ready !== "ok"} className="ml-auto flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
                <RefreshCwIcon className={cn("size-3", scanning && "animate-spin")} /> find withdrawals
              </button>
            ) : null}
          </div>
          {mine.length ? (
            <ul className="divide-y divide-dashed divide-border">
              {mine.map((e) => {
                const l = liveState[e.tx];
                const st = l?.status;
                return (
                  <li key={e.tx} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold tabular-nums">
                        {fmt(BigInt(e.amount))} HYPE <span className="font-normal text-muted-foreground">{e.kind === "deposit" ? `→ ${net.child.name}` : `→ ${net.parent.name}`}</span>
                      </span>
                      <TxHash hash={e.tx} />
                    </span>
                    {e.kind === "deposit" ? (
                      l?.arrived ? (
                        <Badge variant="success">
                          <CheckIcon /> arrived
                        </Badge>
                      ) : (
                        <Badge>
                          <LoaderIcon className="animate-spin" /> arriving
                        </Badge>
                      )
                    ) : st?.state === "claimed" ? (
                      <Badge variant="success">
                        <CheckIcon /> claimed
                      </Badge>
                    ) : st?.state === "ready" ? (
                      <Button variant="signal" size="sm" onClick={() => claim(e)} disabled={!!busy}>
                        Claim
                      </Button>
                    ) : (
                      <Badge>{st?.etaSeconds !== undefined ? `ready in ${eta(st.etaSeconds)}` : "in challenge period"}</Badge>
                    )}
                    {l?.error ? <span className="w-full text-[11px] text-destructive">{l.error}</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-xs text-muted-foreground">
              {address ? "No transfers from this wallet yet." : "Connect a wallet to see your transfers."}
            </p>
          )}
        </div>
      </div>

      <p className="mt-6 flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-signal" />
        This is Elysium’s own canonical bridge (Arbitrum Orbit): every contract address is read from the rollup contract on HyperEVM and the
        chain IDs are checked before anything is sent. HYPE moves 1:1; you only pay gas. Withdrawals wait out the challenge period
        (about a week on mainnet) before they can be claimed. Not affiliated with Kinetiq.
      </p>
    </Section>
  );
}

function Side({ label, chain, balance }: { label: string; chain: string; balance: bigint | null }) {
  return (
    <div className="flex items-center justify-between border border-border bg-background px-4 py-3">
      <span>
        <span className="block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
        <span className="font-semibold">{chain}</span>
      </span>
      <span className="text-right text-xs text-muted-foreground">
        balance
        <span className="block text-sm tabular-nums text-foreground">{balance === null ? "—" : `${fmt(balance, 4)} HYPE`}</span>
      </span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-border" />
      <dd className="text-right">{v}</dd>
    </div>
  );
}

function TxHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(hash).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
    >
      {shortAddr(hash)} {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
    </button>
  );
}
