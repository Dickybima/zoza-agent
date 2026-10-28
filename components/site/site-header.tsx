"use client";

import { useState } from "react";
import { CopyIcon, LogOutIcon, MenuIcon, RefreshCwIcon, WalletIcon, XIcon } from "lucide-react";

import { shortAddr } from "@/lib/agent";
import { useTokens } from "@/lib/tokens";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/site/theme-toggle";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#agent", label: "Agent" },
  { href: "#explore", label: "Explore" },
  { href: "#network", label: "Network" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { tokens } = useTokens();

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 font-semibold tracking-[0.2em]">
          <Logo className="size-7" />
          ZOZA
        </a>

        <nav className="ml-6 hidden items-center gap-1 text-[13px] text-muted-foreground lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-sm px-2.5 py-1.5 transition-colors hover:bg-accent hover:text-foreground">
              {l.label}
              {l.href === "#explore" && tokens.length > 0 ? (
                <span className="ml-1.5 text-signal">[{tokens.length}]</span>
              ) : null}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <WalletButton />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
      </div>

      <nav className={cn("border-t border-border bg-background lg:hidden", open ? "block" : "hidden")}>
        {LINKS.map((l, i) => (
          <a
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 border-b border-dashed border-border px-6 py-3.5 text-sm last:border-b-0 hover:bg-accent"
          >
            <span className="text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            {l.label}
            {l.href === "#explore" && tokens.length > 0 ? <span className="text-signal">[{tokens.length}]</span> : null}
          </a>
        ))}
      </nav>
    </header>
  );
}

function WalletButton() {
  const { address, walletName, openPicker, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);

  if (!address) {
    return (
      <Button variant="outline" size="sm" onClick={openPicker}>
        <WalletIcon />
        <span className="hidden sm:inline">Connect Wallet</span>
        <span className="sm:hidden">Connect</span>
      </Button>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span className="size-1.5 rounded-full bg-signal" />
          {shortAddr(address)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="text-xs text-muted-foreground">{walletName}</span>
          <span className="text-sm">{shortAddr(address)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => (e.preventDefault(), copy())}>
          <CopyIcon /> {copied ? "Copied ✓" : "Copy address"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openPicker}>
          <RefreshCwIcon /> Switch wallet
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={disconnect}>
          <LogOutIcon /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
