"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CopyIcon, LogOutIcon, MenuIcon, RefreshCwIcon, WalletIcon, XIcon } from "lucide-react";

import { shortAddr } from "@/lib/agent";
import { PAGES, isActive } from "@/lib/nav";
import { LiveTicker } from "@/components/site/live-ticker";
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

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/75 backdrop-blur-md">
      <LiveTicker />
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5 font-semibold tracking-[0.2em]">
          <Logo className="size-7" />
          ZOZA
        </Link>

        <nav className="ml-6 hidden items-center gap-1 text-[13px] text-muted-foreground lg:flex">
          {PAGES.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-sm px-2.5 py-1.5 transition-colors hover:bg-accent hover:text-foreground",
                  active && "text-foreground after:absolute after:inset-x-2.5 after:-bottom-[13px] after:h-px after:bg-signal",
                )}
              >
                {l.label}
              </Link>
            );
          })}
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
        {PAGES.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 border-b border-dashed border-border px-6 py-3.5 text-sm last:border-b-0 hover:bg-accent",
                active && "bg-accent",
              )}
            >
              <span className={cn("text-xs", active ? "text-signal" : "text-muted-foreground")}>{active ? "›" : l.index}</span>
              {l.label}
            </Link>
          );
        })}
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
