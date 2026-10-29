"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, ArrowUpRightIcon, CopyIcon, GlobeIcon, LoaderIcon, SendIcon } from "lucide-react";
import { formatEther, isAddress, parseEther } from "viem";
import type { Address } from "viem";

import { shortAddr, timeAgo } from "@/lib/agent";
import { explorerToken, explorerTx, EXPLORER } from "@/lib/chain";
import { fetchCurve, fetchTokenInfo, fetchTrades, findLaunchBlock, minOut, quoteBuy, quoteSell, spotPrice, trade, launchedTokenAbi } from "@/lib/curve";
import type { CurveState, TokenInfo, Trade } from "@/lib/curve";
import { fmtEth, fmtPrice, fmtTokens, fmtUsd, fmtUsdPrice } from "@/lib/format";
import { useEthUsd } from "@/hooks/use-eth-usd";
import { readClient } from "@/lib/rpc";
import type { ChainError } from "@/lib/rpc";
import { useTokens } from "@/lib/tokens";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceChart } from "@/components/site/price-chart";
import type { PricePoint } from "@/components/site/price-chart";
import { TokenAvatar } from "@/components/site/token-avatar";
import { OFFICIAL_ADDRESS } from "@/lib/official";

const INTERVALS = [
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
  { label: "15m", sec: 900 },
  { label: "1h", sec: 3600 },
];
const POLL_MS = 8_000;
const FALLBACK_LOOKBACK = BigInt(200_000);

/** Closing price per time bucket, scaled by `rate` (ETH → USD). */
function buildLine(trades: Trade[], sec: number, rate: number): PricePoint[] {
  const out: PricePoint[] = [];
  for (const t of trades) {
    if (!t.time || !t.price) continue;
    const time = (Math.floor(t.time / sec) * sec) as PricePoint["time"];
    const value = t.price * rate;
    const last = out[out.length - 1];
    if (last && last.time === time) last.value = value;
    else out.push({ time, value });
  }
  return out;
}

type Loaded = { info: TokenInfo; curve: CurveState; trades: Trade[]; head: bigint };

export function TokenView() {
  const params = useSearchParams();
  const raw = params.get("address") ?? "";
  const address = isAddress(raw) ? (raw as Address) : null;
  const { tokens } = useTokens();
  const local = useMemo(() => tokens.find((t) => t.address.toLowerCase() === raw.toLowerCase()), [tokens, raw]);
  const blockParam = params.get("block");
  const knownBlock = blockParam && /^\d+$/.test(blockParam) ? BigInt(blockParam) : local?.block ? BigInt(local.block) : null;

  const client = useMemo(() => readClient(), []);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setIntervalSec] = useState(60);
  const dataRef = useRef<Loaded | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // initial load: token metadata, curve state and the full trade history
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchTokenInfo(client, address);
        const [curve, head] = await Promise.all([fetchCurve(client, info.curve), client.getBlockNumber()]);
        const from =
          knownBlock ?? (await findLaunchBlock(client, address, head)) ?? (head > FALLBACK_LOOKBACK ? head - FALLBACK_LOOKBACK : BigInt(0));
        const trades = await fetchTrades(client, info.curve, from, head);
        if (!cancelled) setData({ info, curve, trades, head });
      } catch (err) {
        console.warn("[zoza] token load failed", err);
        if (!cancelled) setError("Couldn’t load this token from Robinhood Chain. Check the address, then refresh to try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // knownBlock only matters for the first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, client]);

  /** Pulls new trades since the last seen block and the current curve state. */
  const refresh = useCallback(async () => {
    const d = dataRef.current;
    if (!d) return;
    try {
      const head = await client.getBlockNumber();
      const [curve, fresh] = await Promise.all([
        fetchCurve(client, d.info.curve),
        fetchTrades(client, d.info.curve, d.head + BigInt(1), head),
      ]);
      setData((prev) => (prev ? { ...prev, curve, head, trades: fresh.length ? [...prev.trades, ...fresh] : prev.trades } : prev));
    } catch (err) {
      console.warn("[zoza] token refresh failed", err);
    }
  }, [client]);

  useEffect(() => {
    if (!data) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [data, refresh]);

  // USD when the ETH price is known; ETH until then
  const ethUsd = useEthUsd();
  const rate = ethUsd ?? 1;
  const usd = ethUsd !== null;
  const fmtP = useCallback((v: number) => (usd ? fmtUsdPrice(v) : `${fmtPrice(v)} ETH`), [usd]);
  const fmtV = (eth: number) => (usd ? fmtUsd(eth * rate) : `${fmtPrice(eth)} ETH`);
  const points = useMemo(() => buildLine(data?.trades ?? [], interval, rate), [data?.trades, interval, rate]);

  if (!address) return <Notice title="Token not found" body="This link has no valid token address." />;
  if (error) return <Notice title="Couldn’t load token" body={error} />;
  if (!data) {
    return (
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-24 text-sm text-muted-foreground sm:px-6">
        <LoaderIcon className="size-4 animate-spin" /> reading token from Robinhood Chain…
      </div>
    );
  }

  const { info, curve, trades } = data;
  const price = spotPrice(curve);
  const mcap = price * Number(formatEther(info.totalSupply));
  const progress = curve.threshold > BigInt(0) ? Math.min(1, Number(formatEther(curve.realQuote)) / Number(formatEther(curve.threshold))) : 0;
  const logo = info.logo || local?.logo;
  // the official token shows the Zoza mark if its on-chain artwork is missing or won't load
  const logoFallback = info.address.toLowerCase() === OFFICIAL_ADDRESS.toLowerCase() ? "/icon.svg" : undefined;
  const lastTrade = trades[trades.length - 1];
  const firstPrice = trades[0]?.price;
  const change = firstPrice && lastTrade ? (lastTrade.price / firstPrice - 1) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
      <Link href="/explore" className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-3.5" /> explore
      </Link>

      {/* header */}
      <div className="mb-8 flex flex-wrap items-center gap-5">
        <TokenAvatar src={logo} label={info.symbol} seed={info.address} fallback={logoFallback} className="size-16 sm:size-20" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{info.name}</h1>
            <Badge variant={curve.graduated ? "signal" : "outline"}>{curve.graduated ? "Graduated" : "Bonding curve"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">${info.symbol}</p>
        </div>
        <div className="w-full sm:w-auto sm:text-right">
          <p className="text-2xl font-semibold tabular-nums">{fmtP(price * rate)}</p>
          <p className="text-xs text-muted-foreground">
            mcap {fmtV(mcap)}
            {trades.length ? (
              <span className={cn("ml-2", change >= 0 ? "text-signal" : "text-destructive")}>
                {change >= 0 ? "+" : ""}
                {change.toFixed(1)}%
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {/* on small screens: chart → trade panel → transactions */}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          {/* chart */}
          <div className="border border-border bg-card/50">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
              <span>price · {usd ? "USD" : "ETH"}</span>
              <div className="flex gap-1">
                {INTERVALS.map((i) => (
                  <button
                    key={i.sec}
                    type="button"
                    onClick={() => setIntervalSec(i.sec)}
                    className={cn("px-2 py-0.5 transition-colors hover:text-foreground", interval === i.sec && "bg-accent text-foreground")}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative h-[360px]">
              <PriceChart points={points} format={fmtP} />
              {!points.length ? (
                <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                  No trades yet — be the first to buy.
                </p>
              ) : null}
            </div>
          </div>

          {/* stats */}
          <dl className="grid grid-cols-2 border border-border sm:grid-cols-4">
            <Stat label="liquidity" value={fmtV(Number(formatEther(curve.realQuote)))} />
            <Stat label="trades" value={String(trades.length)} />
            <Stat label="base fee" value={`${Number(curve.feeBps) / 100}%`} />
            <Stat label="creator tax" value={`${Number(curve.taxBps) / 100}%`} />
          </dl>
          <div className="border border-border p-4 text-xs">
            <div className="mb-2 flex justify-between text-muted-foreground">
              <span>bonding curve → Uniswap v4</span>
              <span>
                {fmtV(Number(formatEther(curve.realQuote)))} / {fmtV(Number(formatEther(curve.threshold)))}
              </span>
            </div>
            <p className="tracking-tight text-signal">
              [{"█".repeat(Math.round(progress * 30))}
              <span className="text-muted-foreground/50">{"░".repeat(30 - Math.round(progress * 30))}</span>] {(progress * 100).toFixed(1)}%
            </p>
          </div>

        </div>

        <div className="space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <TradePanel info={info} curve={curve} onTraded={refresh} ethUsd={ethUsd} />
          <InfoCard info={info} />
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <TradesTable trades={trades} symbol={info.symbol} ethUsd={ethUsd} />
        </div>
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <Link href="/explore" className="mt-6 inline-flex items-center gap-2 text-sm hover:text-signal">
        <ArrowLeftIcon className="size-4" /> back to explore
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-dashed border-border p-4 last:border-r-0 sm:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const BUY_PRESETS = ["0.001", "0.01", "0.05", "0.1"];
const SELL_PRESETS = [25, 50, 75, 100];
const SLIPPAGES = [100, 500, 1000];

function TradePanel({
  info,
  curve,
  onTraded,
  ethUsd,
}: {
  info: TokenInfo;
  curve: CurveState;
  onTraded: () => Promise<void>;
  ethUsd: number | null;
}) {
  const inUsd = (wei: bigint) => (ethUsd ? ` (${fmtUsd(Number(formatEther(wei)) * ethUsd)})` : "");
  const { address, connect, getProvider } = useWallet();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(500);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [balances, setBalances] = useState<{ eth: bigint; tokens: bigint } | null>(null);

  const loadBalances = useCallback(async () => {
    if (!address) return;
    try {
      const client = readClient();
      const account = address as Address;
      const [eth, tokens] = await Promise.all([
        client.getBalance({ address: account }),
        client.readContract({ address: info.address, abi: launchedTokenAbi, functionName: "balanceOf", args: [account] }),
      ]);
      setBalances({ eth, tokens });
    } catch {
      // balances are a convenience; trading still works without them
    }
  }, [address, info.address]);

  useEffect(() => {
    const first = setTimeout(loadBalances, 0);
    const id = setInterval(loadBalances, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [loadBalances]);

  let parsed: bigint | null = null;
  try {
    parsed = amount && Number(amount) > 0 ? parseEther(amount) : null;
  } catch {
    parsed = null;
  }
  const expected = parsed ? (tab === "buy" ? quoteBuy(curve, parsed) : quoteSell(curve, parsed)) : BigInt(0);
  const insufficient = !!(parsed && balances && (tab === "buy" ? parsed > balances.eth : parsed > balances.tokens));

  const submit = async () => {
    setResult(null);
    const wallet = address ?? (await connect());
    const provider = getProvider();
    if (!wallet || !provider || !parsed) return;
    setBusy("starting");
    try {
      const order =
        tab === "buy"
          ? { kind: "buy" as const, ethIn: parsed, minTokens: minOut(expected, slippage) }
          : { kind: "sell" as const, tokensIn: parsed, minEth: minOut(expected, slippage) };
      const { hash } = await trade(provider, wallet, info.curve, info.address, order, setBusy);
      setResult({
        ok: true,
        text: tab === "buy" ? `Bought ~${fmtTokens(expected)} $${info.symbol}.` : `Sold for ~${fmtEth(expected)} ETH${inUsd(expected)}.`,
        tx: hash,
      });
      setAmount("");
      await Promise.all([onTraded(), loadBalances()]);
    } catch (err) {
      const e = err as ChainError;
      setResult({ ok: false, text: e.rejected ? "Cancelled in your wallet." : e.message });
    } finally {
      setBusy(null);
    }
  };

  if (curve.graduated) {
    return (
      <div className="border border-border bg-card/50 p-5 text-sm">
        <p className="font-semibold">Graduated</p>
        <p className="mt-2 text-muted-foreground">
          ${info.symbol} has left its bonding curve and now trades in its locked Uniswap v4 pool.
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <a href={explorerToken(info.address)} target="_blank" rel="noopener noreferrer">
            View on explorer <ArrowUpRightIcon />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card/50">
      <div className="grid grid-cols-2 border-b border-border text-sm">
        {(["buy", "sell"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setAmount("");
              setResult(null);
            }}
            className={cn(
              "py-3 font-semibold uppercase tracking-wider transition-colors",
              tab === t ? (t === "buy" ? "bg-signal/10 text-signal" : "bg-destructive/10 text-destructive") : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
            <span>{tab === "buy" ? "you pay" : "you sell"}</span>
            {balances ? (
              <span>
                balance {tab === "buy" ? `${fmtEth(balances.eth, 4)} ETH${inUsd(balances.eth)}` : `${fmtTokens(balances.tokens)} $${info.symbol}`}
              </span>
            ) : null}
          </div>
          <div className="flex items-center border border-input focus-within:border-ring">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
              placeholder="0.0"
              aria-label={tab === "buy" ? "ETH amount" : "Token amount"}
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-lg outline-none"
            />
            <span className="px-3 text-sm text-muted-foreground">{tab === "buy" ? "ETH" : `$${info.symbol}`}</span>
          </div>
          {tab === "buy" && parsed && ethUsd ? (
            <p className="mt-1 text-right text-xs text-muted-foreground">≈ {fmtUsd(Number(formatEther(parsed)) * ethUsd)}</p>
          ) : null}
          <div className="mt-2 flex gap-1.5">
            {tab === "buy"
              ? BUY_PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setAmount(p)} className="flex-1 border border-border py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground">
                    {p}
                  </button>
                ))
              : SELL_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={!balances?.tokens}
                    onClick={() => balances && setAmount(formatEther((balances.tokens * BigInt(p)) / BigInt(100)))}
                    className="flex-1 border border-border py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
                  >
                    {p}%
                  </button>
                ))}
          </div>
        </div>

        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">you receive ≈</dt>
            <dd className="tabular-nums">
              {tab === "buy" ? `${fmtTokens(expected)} $${info.symbol}` : `${fmtEth(expected)} ETH${inUsd(expected)}`}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">slippage</dt>
            <dd className="flex gap-1">
              {SLIPPAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlippage(s)}
                  className={cn("px-1.5 py-0.5 text-muted-foreground hover:text-foreground", slippage === s && "bg-accent text-foreground")}
                >
                  {s / 100}%
                </button>
              ))}
            </dd>
          </div>
        </dl>

        <Button
          className="w-full"
          variant={tab === "buy" ? "signal" : "destructive"}
          disabled={!!busy || (!!address && (!parsed || insufficient || expected === BigInt(0)))}
          onClick={submit}
        >
          {busy ? (
            <>
              <LoaderIcon className="animate-spin" /> {busy}
            </>
          ) : !address ? (
            "Connect wallet"
          ) : insufficient ? (
            "Insufficient balance"
          ) : tab === "buy" ? (
            `Buy $${info.symbol}`
          ) : (
            `Sell $${info.symbol}`
          )}
        </Button>

        {result ? (
          <p className={cn("border px-3 py-2 text-xs", result.ok ? "border-signal/40 text-signal" : "border-destructive/40 text-destructive")}>
            {result.text}{" "}
            {result.tx ? (
              <a href={explorerTx(result.tx)} target="_blank" rel="noopener noreferrer" className="underline">
                view tx ↗
              </a>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function InfoCard({ info }: { info: TokenInfo }) {
  const [copied, setCopied] = useState(false);
  const links = [
    info.socials.twitter && { href: info.socials.twitter, label: "X", icon: null },
    info.socials.website && { href: info.socials.website, label: "Website", icon: <GlobeIcon /> },
    info.socials.telegram && { href: info.socials.telegram, label: "Telegram", icon: <SendIcon /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="space-y-4 border border-border p-4 text-xs">
      {info.description ? <p className="text-sm leading-relaxed text-muted-foreground">{info.description}</p> : null}
      {links.length ? (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <Button key={l.label} variant="outline" size="sm" asChild>
              <a href={safeUrl(l.href)} target="_blank" rel="noopener noreferrer">
                {l.icon} {l.label === "X" ? "𝕏" : l.label}
              </a>
            </Button>
          ))}
        </div>
      ) : null}
      <dl className="space-y-2">
        {[
          ["contract", info.address],
          ["curve", info.curve],
          ["creator", info.deployer],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <span aria-hidden className="flex-1 translate-y-[-3px] border-b border-dotted border-border" />
            <dd>
              <a href={`${EXPLORER}/address/${v}`} target="_blank" rel="noopener noreferrer" className="hover:text-signal">
                {shortAddr(v)}
              </a>
            </dd>
          </div>
        ))}
      </dl>
      <Button variant="outline" size="sm" className="w-full" onClick={copy}>
        <CopyIcon /> {copied ? "Copied ✓" : "Copy contract"}
      </Button>
    </div>
  );
}

/** Only http(s) links from on-chain metadata are rendered as links. */
const safeUrl = (href: string) => (/^https?:\/\//i.test(href) ? href : `https://${href.replace(/^[a-z]+:/i, "")}`);

function TradesTable({ trades, symbol, ethUsd }: { trades: Trade[]; symbol: string; ethUsd: number | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const rows = [...trades].reverse().slice(0, 50);
  return (
    <div className="border border-border">
      <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">transactions</p>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-dashed border-border">
                <th className="px-4 py-2 font-normal">time</th>
                <th className="px-4 py-2 font-normal">type</th>
                <th className="px-4 py-2 text-right font-normal">{ethUsd ? "USD" : "ETH"}</th>
                <th className="px-4 py-2 text-right font-normal">${symbol}</th>
                <th className="px-4 py-2 text-right font-normal">price</th>
                <th className="px-4 py-2 font-normal">trader</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={`${t.tx}-${t.logIndex}`} className="border-b border-dashed border-border last:border-b-0">
                  <td className="px-4 py-2 text-muted-foreground">{t.time ? timeAgo(t.time * 1000) : "—"}</td>
                  <td className={cn("px-4 py-2 font-semibold uppercase", t.kind === "buy" ? "text-signal" : "text-destructive")}>{t.kind}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {ethUsd ? fmtUsd(Number(formatEther(t.eth)) * ethUsd) : fmtEth(t.eth, 5)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtTokens(t.tokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{ethUsd ? fmtUsdPrice(t.price * ethUsd) : fmtPrice(t.price)}</td>
                  <td className="px-4 py-2">
                    <a href={`${EXPLORER}/address/${t.trader}`} target="_blank" rel="noopener noreferrer" className="hover:text-signal">
                      {shortAddr(t.trader)}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <a href={explorerTx(t.tx)} target="_blank" rel="noopener noreferrer" aria-label="View transaction" className="text-muted-foreground hover:text-foreground">
                      ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions yet.</p>
      )}
    </div>
  );
}
