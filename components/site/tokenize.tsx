"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRightIcon, ImageUpIcon, LoaderIcon, RocketIcon, XIcon } from "lucide-react";

import { CREATOR_FEE, NETWORK, PROTOCOL_FEE, SUPPLY, TAX, fmt, shortAddr } from "@/lib/agent";
import { explorerTx } from "@/lib/chain";
import { launchToken } from "@/lib/launchpad";
import type { LaunchError } from "@/lib/launchpad";
import { PLATFORMS, parseProfile, tickerFrom } from "@/lib/profile";
import type { Platform } from "@/lib/profile";
import { SNAPSHOT_DATE, TOP_PROFILES, profileUrl } from "@/lib/top-profiles";
import type { TopProfile } from "@/lib/top-profiles";
import { useTokens } from "@/lib/tokens";
import { LOGO_ACCEPT } from "@/lib/upload";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { useLogoUpload } from "@/hooks/use-logo-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, SectionHeading } from "@/components/site/section";
import { TokenAvatar } from "@/components/site/token-avatar";

const TICKER = /^[A-Z0-9]{2,10}$/;
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
// clock reads for the launch timer; launch() only runs from a click
const clock = () => performance.now();
const wallClock = () => Date.now();

type Run =
  | { kind: "idle" }
  | { kind: "launching"; status: string }
  | { kind: "error"; message: string }
  | { kind: "live"; token: string; tx: string };

export function Tokenize() {
  const router = useRouter();
  const { address, connect, getProvider } = useWallet();
  const { publish } = useTokens();
  const { logo, pick, remove, settle } = useLogoUpload();

  const [platform, setPlatform] = useState<Platform>("fomo");
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [x, setX] = useState("");
  // the profile's handle prefills name and ticker until the creator edits them
  const [touched, setTouched] = useState({ name: false, ticker: false });
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  // set while the form holds a profile picked from the top list; cleared on any manual edit of the link
  const [picked, setPicked] = useState<TopProfile | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const parsed = parseProfile(platform, link);
  const profile = "url" in parsed ? parsed : null;
  const linkError = "error" in parsed ? parsed.error : "";
  const handle = profile?.handle ?? "";
  const shownName = touched.name ? name : name || handle;
  const shownTicker = touched.ticker ? ticker : ticker || tickerFrom(handle);
  const xHandle = x.trim().replace(/^@/, "").replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, "").replace(/\/$/, "");

  const problems = [
    !profile && `Paste ${PLATFORMS[platform].hint}.`,
    !shownName.trim() && "Give the token a name.",
    shownName.trim().length > 64 && "Keep the name under 64 characters.",
    !TICKER.test(shownTicker) && "Use a ticker of 2 to 10 letters or digits.",
    xHandle && !X_HANDLE.test(xHandle) && "That X handle doesn’t look right.",
  ].filter(Boolean) as string[];
  const busy = run.kind === "launching";
  const live = run.kind === "live";

  // after a launch, give the creator a moment to see it, then open Explore
  useEffect(() => {
    if (run.kind !== "live") return;
    const t = setTimeout(() => router.push("/explore"), 3000);
    return () => clearTimeout(t);
  }, [run.kind, router]);

  const launch = async () => {
    if (problems.length || busy || !profile) return;
    const tokName = shownName.trim();
    const tokTicker = shownTicker;
    setRun({ kind: "launching", status: "connecting your wallet" });
    const wallet = address ?? (await connect());
    const provider = getProvider();
    if (!wallet || !provider) return setRun({ kind: "error", message: "No wallet connected, so nothing was launched." });

    let logoUrl: string;
    try {
      setRun({ kind: "launching", status: "finishing the logo upload" });
      logoUrl = await settle();
    } catch (err) {
      return setRun({ kind: "error", message: `${(err as Error).message} Upload it again or remove it.` });
    }

    const sentAt = clock();
    try {
      const label = PLATFORMS[platform].label;
      const result = await launchToken(
        provider,
        wallet,
        {
          name: tokName,
          ticker: tokTicker,
          x: xHandle || null,
          website: profile.url.replace(/^https:\/\//, ""),
          logo: logoUrl,
          creatorTaxBps: CREATOR_FEE * 100,
          description:
            `${tokName} ($${tokTicker}) — a tokenized ${label} profile: ${profile.url}. Launched with Zoza.` +
            (picked ? ` Unofficial: not created or endorsed by @${picked.handle}.` : ""),
        },
        (status) => setRun({ kind: "launching", status }),
      );
      publish({
        name: tokName,
        ticker: tokTicker,
        x: xHandle || null,
        website: profile.url.replace(/^https:\/\//, ""),
        address: result.token,
        curve: result.curve,
        logo: logoUrl || undefined,
        block: Number(result.block),
        creator: wallet,
        tx: result.hash,
        createdAt: wallClock(),
        launchSeconds: Math.round((clock() - sentAt) / 100) / 10,
        profile: { platform, url: profile.url, ...(picked ? { unofficial: true } : {}) },
      });
      setRun({ kind: "live", token: result.token, tx: result.hash });
    } catch (err) {
      const e = err as LaunchError;
      setRun({ kind: "error", message: e.rejected ? "Launch cancelled in your wallet." : `Launch failed: ${e.message}` });
    }
  };

  // fill the form from a listed profile, then bring the form into view
  const pickProfile = (p: TopProfile) => {
    if (busy || live) return;
    setPlatform(p.platform);
    setLink(profileUrl(p));
    setName(p.name);
    setTicker(tickerFrom(p.handle));
    setTouched({ name: true, ticker: true });
    setPicked(p);
    setRun({ kind: "idle" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onFile = (file?: File | null) => {
    if (file && !busy && !live) pick(file);
  };

  return (
    <Section>
      <SectionHeading index="06" label="Tokenize" title="Turn any profile into a token.">
        Paste a fomo or pump.fun profile link, give it a name and a ticker, and launch it on {NETWORK}. {TAX}% tax on every
        trade: {CREATOR_FEE}% to you.
      </SectionHeading>

      <div ref={formRef} className="grid scroll-mt-28 gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        {/* form */}
        <div className={cn("border bg-card/50 transition-colors duration-700", picked ? "border-signal/60" : "border-border")}>
          <PanelBar title="tokenize --profile" />
          <div className="space-y-6 p-5 sm:p-6">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">platform</p>
              <div role="radiogroup" aria-label="Profile platform" className="grid grid-cols-2 border border-border">
                {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={platform === p}
                    disabled={busy || live}
                    onClick={() => {
                      setPlatform(p);
                      setPicked(null);
                    }}
                    className={cn(
                      "px-3 py-2.5 text-sm transition-colors first:border-r first:border-border",
                      platform === p ? "bg-signal text-signal-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {PLATFORMS[p].label} profile
                  </button>
                ))}
              </div>
            </div>

            <Field label="profile link" hint={link && linkError ? linkError : undefined} error={!!(link && linkError)}>
              <Input
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setPicked(null);
                }}
                placeholder={PLATFORMS[platform].example}
                disabled={busy || live}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="token name">
                <Input
                  value={shownName}
                  maxLength={64}
                  onChange={(e) => {
                    setTouched((t) => ({ ...t, name: true }));
                    setName(e.target.value);
                  }}
                  placeholder={handle || "My Profile"}
                  disabled={busy || live}
                />
              </Field>
              <Field label="ticker">
                <Input
                  value={shownTicker}
                  maxLength={10}
                  onChange={(e) => {
                    setTouched((t) => ({ ...t, ticker: true }));
                    setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                  }}
                  placeholder="TICKER"
                  disabled={busy || live}
                />
              </Field>
            </div>

            <Field label="x account (optional)">
              <Input value={x} onChange={(e) => setX(e.target.value)} placeholder="@handle" disabled={busy || live} autoComplete="off" />
            </Field>

            <div>
              <p className="mb-2 text-xs text-muted-foreground">profile picture</p>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-4 border border-dashed border-border px-4 py-4 transition-colors hover:border-foreground/40",
                  dragging && "border-signal bg-signal/5",
                  (busy || live) && "pointer-events-none opacity-60",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  onFile(e.dataTransfer.files[0]);
                }}
              >
                <TokenAvatar src={logo?.preview ?? null} label={shownTicker || "?"} seed={profile?.url} className="size-14" />
                <span className="min-w-0 flex-1 text-xs">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <ImageUpIcon className="size-3.5" /> {logo ? "change picture" : "upload the profile picture"}
                  </span>
                  <span
                    role="status"
                    className={cn(
                      "mt-1 block",
                      logo?.status === "error" ? "text-destructive" : logo?.status === "ready" ? "text-signal" : "text-muted-foreground",
                    )}
                  >
                    {!logo
                      ? "PNG, JPG, WEBP or GIF · or drop it here"
                      : logo.status === "uploading"
                        ? "uploading…"
                        : logo.status === "ready"
                          ? "✓ picture ready"
                          : logo.error}
                  </span>
                </span>
                <input
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="sr-only"
                  disabled={busy || live}
                  onChange={(e) => {
                    onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {logo && !busy && !live ? (
                <button type="button" onClick={remove} className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  <XIcon className="size-3" /> remove picture
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* preview + launch */}
        <div className="grid content-start gap-4 lg:sticky lg:top-28">
          <div className="border border-border bg-background/80">
            <PanelBar title="preview.json" />
            <div className="p-5">
              <div className="mb-4 flex items-center gap-3">
                <TokenAvatar src={logo?.preview ?? null} label={shownTicker || "?"} seed={profile?.url} className="size-16" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{shownName.trim() || "Your profile token"}</p>
                  <p className="text-xs text-muted-foreground">{shownTicker ? "$" + shownTicker : "ticker pending"}</p>
                </div>
                <Badge variant="signal">{PLATFORMS[platform].label}</Badge>
              </div>
              <dl className="space-y-2 text-xs">
                {[
                  ["profile", profile ? profile.url.replace(/^https:\/\//, "") : "…"],
                  ["x", xHandle ? "@" + xHandle : "—"],
                  ["tax", `${TAX}% buy & sell`],
                  [`creator_fee (${CREATOR_FEE}%)`, address ? shortAddr(address) : "your wallet"],
                  [`protocol_fee (${PROTOCOL_FEE}%)`, "protocol"],
                  ["supply", fmt(SUPPLY)],
                  ["network", NETWORK],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2">
                    <dt className="shrink-0 text-muted-foreground">{k}</dt>
                    <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-border" />
                    <dd className="truncate text-right">{v}</dd>
                  </div>
                ))}
              </dl>

              {run.kind === "live" ? (
                <div className="mt-5 border border-signal/50 bg-signal/10 px-3 py-3 text-xs text-signal">
                  <p>● LIVE on {NETWORK} · {shortAddr(run.token)}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-foreground">
                    <Link href="/explore" className="hover:text-signal">
                      Opening Explore…
                    </Link>
                    <a href={explorerTx(run.tx)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                      View transaction ↗
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  <Button variant="signal" size="lg" className="mt-5 w-full" onClick={launch} disabled={!!problems.length || busy}>
                    {busy ? <LoaderIcon className="animate-spin" /> : <RocketIcon />}
                    {busy ? "Launching…" : `Launch ${shownTicker ? "$" + shownTicker : "token"}`}
                  </Button>
                  <p
                    role="status"
                    className={cn("mt-3 min-h-4 text-xs", run.kind === "error" ? "text-destructive" : "text-muted-foreground")}
                  >
                    {run.kind === "launching"
                      ? `› ${run.status}…`
                      : run.kind === "error"
                        ? run.message
                        : problems[0] && (link || name || ticker)
                          ? problems[0]
                          : "One signature in your wallet. You pay the launch fee and gas."}
                  </p>
                </>
              )}
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Zoza isn’t affiliated with fomo or pump.fun, and profiles aren’t verified. The {CREATOR_FEE}% creator fee goes to the
            wallet that launches the token. The profile link is stored in the token’s on-chain metadata.{" "}
            <Link href="/explore" className="inline-flex items-center gap-0.5 text-foreground hover:text-signal">
              See launched tokens <ArrowUpRightIcon className="size-3" />
            </Link>
          </p>
        </div>
      </div>

      <TopProfiles onPick={pickProfile} disabled={busy || live} pickedHandle={picked?.handle ?? null} />
    </Section>
  );
}

type Filter = "all" | Platform;

function TopProfiles({ onPick, disabled, pickedHandle }: { onPick: (p: TopProfile) => void; disabled: boolean; pickedHandle: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = TOP_PROFILES.filter((p) => filter === "all" || p.platform === filter).sort((a, b) => b.followers - a.followers);
  const tabs: [Filter, string][] = [["all", "All"], ["fomo", "@fomo"], ["pumpfun", "@pump.fun"]];

  return (
    <div className="mt-20">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="mb-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span className="text-signal">[ ★ ]</span> top profiles
          </p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tokenize a top profile.</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            The most-followed creators on fomo and pump.fun. Press Tokenize and the form above fills itself in; review it, add the
            picture, and launch.
          </p>
        </div>
        <div role="tablist" aria-label="Filter profiles" className="flex shrink-0 border border-border">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "px-3 py-2 text-xs transition-colors not-last:border-r not-last:border-border",
                filter === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto border border-border">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              <th className="w-12 px-4 py-3 font-normal">#</th>
              <th className="px-4 py-3 font-normal">profile</th>
              <th className="px-4 py-3 text-right font-normal">followers</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((p, i) => (
                <tr
                  key={p.platform + p.handle}
                  className={cn("border-b border-dashed border-border last:border-b-0 transition-colors hover:bg-accent/50", pickedHandle === p.handle && "bg-signal/5")}
                >
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3">
                    <a href={profileUrl(p)} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3">
                      <TokenAvatar src={null} label={p.name} seed={p.platform + p.handle} className="size-10 rounded-full" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold group-hover:text-signal">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{p.handle} · {PLATFORMS[p.platform].label}
                        </span>
                      </span>
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.followers.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant={pickedHandle === p.handle ? "signal" : "outline"} size="sm" disabled={disabled} onClick={() => onPick(p)}>
                      {pickedHandle === p.handle ? "Selected ✓" : "Tokenize"}
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  No {filter === "pumpfun" ? "pump.fun" : "fomo"} profiles listed yet. Paste any profile link in the form above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Follower counts as of {SNAPSHOT_DATE}. Tokens launched from this list are marked unofficial on-chain and in Explore: they
        aren’t created or endorsed by the profile owner.
      </p>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className={cn("mt-1.5 block text-[11px]", error ? "text-destructive" : "text-muted-foreground")}>{hint}</span> : null}
    </label>
  );
}

function PanelBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
      <span aria-hidden className="flex gap-1.5">
        <span className="size-2.5 border border-border" />
        <span className="size-2.5 border border-border" />
        <span className="size-2.5 bg-signal" />
      </span>
      <span className="truncate">{title}</span>
    </div>
  );
}
