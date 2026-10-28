"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon, CopyIcon, GlobeIcon, SearchIcon } from "lucide-react";
import { isAddress } from "viem";

import { CREATOR_FEE, TAX, shortAddr, timeAgo } from "@/lib/agent";
import type { LaunchedToken } from "@/lib/agent";
import { explorerToken } from "@/lib/chain";
import { useTokens } from "@/lib/tokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Section, SectionHeading } from "@/components/site/section";
import { TokenAvatar } from "@/components/site/token-avatar";

const tokenHref = (t: Pick<LaunchedToken, "address" | "block">) =>
  `/token?address=${t.address}${t.block ? `&block=${t.block}` : ""}`;

type Sort = "new" | "old" | "az";

export function Explore() {
  const { tokens, fresh } = useTokens();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [, setTick] = useState(0);

  // refresh the "x ago" labels
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = tokens.filter(
      (t) => !query || [t.name, t.ticker, t.address].some((v) => v.toLowerCase().includes(query)),
    );
    return filtered.sort((a, b) =>
      sort === "az" ? a.name.localeCompare(b.name) : sort === "old" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
    );
  }, [tokens, q, sort]);

  return (
    <Section id="explore">
      <SectionHeading index="04" label="Explore" title="Every token born through Zoza.">
        Tokens launched by the agent appear here automatically, the moment they go live.
      </SectionHeading>

      <div className="mb-8 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="grep name, ticker, or contract…"
            aria-label="Search tokens"
            className="pl-9"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort tokens"
          className="h-10 cursor-pointer rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          <option value="new">--sort newest</option>
          <option value="old">--sort oldest</option>
          <option value="az">--sort name</option>
        </select>
      </div>

      {isAddress(q.trim()) ? (
        <Link
          href={`/token?address=${q.trim()}`}
          className="mb-6 flex items-center justify-between border border-signal/40 bg-signal/5 px-4 py-3 text-sm hover:bg-signal/10"
        >
          <span>
            <span className="text-signal">›</span> open token {shortAddr(q.trim())}
          </span>
          <ArrowRightIcon className="size-4" />
        </Link>
      ) : null}

      {tokens.length === 0 ? (
        <EmptyState>
          <p>No tokens yet. The first launch through Zoza will appear here.</p>
          <Button asChild className="mt-6">
            <Link href="/agent">
              Launch the first one <ArrowRightIcon />
            </Link>
          </Button>
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>
          <p>No tokens match “{q}”.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <TokenCard key={t.address} t={t} fresh={t.address === fresh} />
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-xs text-muted-foreground">{"// tokens launched through Zoza in this browser · live on Robinhood Chain"}</p>
    </Section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
      <pre aria-hidden className="mb-6 text-xs leading-tight text-muted-foreground/70">
        {"   .-------.\n  /  ? ? ?  \\\n |  [_____]  |\n  \\_________/"}
      </pre>
      {children}
    </div>
  );
}

function TokenCard({ t, fresh }: { t: LaunchedToken; fresh: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <Card className={fresh ? "border-signal/60 animate-in fade-in-0 zoom-in-95 duration-500" : undefined}>
      <Link href={tokenHref(t)} className="flex items-start gap-3 hover:text-signal">
        <TokenAvatar src={t.logo} label={t.ticker} className="size-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{t.name}</p>
          <p className="text-xs text-muted-foreground">${t.ticker}</p>
        </div>
        {fresh ? <Badge variant="signal">New</Badge> : null}
      </Link>
      <dl className="space-y-1.5 text-xs">
        {[
          ["contract", shortAddr(t.address)],
          ["creator", shortAddr(t.creator)],
          ["tax", `${TAX}% · ${CREATOR_FEE}% creator`],
          ["launched", timeAgo(t.createdAt)],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <span aria-hidden className="flex-1 translate-y-[-3px] border-b border-dotted border-border" />
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        {t.x ? (
          <Button variant="outline" size="sm" asChild>
            <a href={`https://x.com/${encodeURIComponent(t.x)}`} target="_blank" rel="noopener noreferrer">
              𝕏 @{t.x}
            </a>
          </Button>
        ) : null}
        {t.website ? (
          <Button variant="outline" size="sm" asChild>
            <a href={`https://${encodeURI(t.website)}`} target="_blank" rel="noopener noreferrer">
              <GlobeIcon /> Website
            </a>
          </Button>
        ) : null}
        <Button variant="signal" size="sm" asChild>
          <Link href={tokenHref(t)}>
            Trade <ArrowRightIcon />
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={explorerToken(t.address)} target="_blank" rel="noopener noreferrer">
            Explorer <ArrowUpRightIcon />
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={copy}>
          <CopyIcon /> {copied ? "Copied ✓" : "Copy contract"}
        </Button>
      </div>
    </Card>
  );
}
