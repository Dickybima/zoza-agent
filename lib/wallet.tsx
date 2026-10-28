"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRightIcon, LoaderIcon, LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { randHex } from "@/lib/agent";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Logo } from "@/components/site/logo";

// Wallet picker: detects installed wallets via EIP-6963 (plus the legacy
// window.ethereum flags), offers install links for the rest, and a demo
// wallet for trying Zoza without an extension.

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: never[]) => void) => void;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isRobinhood?: boolean;
};
type ProviderDetail = {
  info: { uuid?: string; name: string; icon?: string; rdns?: string };
  provider: Eip1193Provider;
};
type WalletDef = {
  id: string;
  name: string;
  rdns?: string;
  match?: RegExp;
  legacy?: (p: Eip1193Provider) => boolean | undefined;
  install?: string;
  soon?: boolean;
};

const WALLETS: WalletDef[] = [
  { id: "robinhood", name: "Robinhood Wallet", match: /robinhood/i, legacy: (e) => e.isRobinhood, install: "https://robinhood.com/us/en/web3-wallet/" },
  { id: "metamask", name: "MetaMask", rdns: "io.metamask", legacy: (e) => e.isMetaMask && !e.isRabby, install: "https://metamask.io/download/" },
  { id: "coinbase", name: "Coinbase Wallet", rdns: "com.coinbase.wallet", legacy: (e) => e.isCoinbaseWallet, install: "https://www.coinbase.com/wallet/downloads" },
  { id: "rabby", name: "Rabby Wallet", rdns: "io.rabby", legacy: (e) => e.isRabby, install: "https://rabby.io/" },
  { id: "walletconnect", name: "WalletConnect", soon: true },
];

type Option = WalletDef & { detail: ProviderDetail | null; demo?: boolean };

/** What the user is asked to approve in their wallet before a launch. */
export type LaunchRequest = { title: string; lines: [string, string][] };
type ConfirmState = LaunchRequest & { resolve: (ok: boolean) => void };

const toHex = (s: string) =>
  "0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");

type WalletCtx = {
  address: string | null;
  walletName: string | null;
  /** Resolves with the connected address, or null if the picker was dismissed. */
  connect: () => Promise<string | null>;
  openPicker: () => void;
  disconnect: () => void;
  /**
   * Asks the connected wallet to approve a launch. A real wallet pops up its
   * own signature request straight away (personal_sign, no gas); the demo
   * wallet shows an in-app prompt instead. Resolves false when rejected.
   */
  confirmLaunch: (req: LaunchRequest) => Promise<boolean>;
};

const Ctx = createContext<WalletCtx | null>(null);

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [announced, setAnnounced] = useState<ProviderDetail[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const addressRef = useRef<string | null>(null);
  const providerRef = useRef<Eip1193Provider | null>(null);
  const resolverRef = useRef<((a: string | null) => void) | null>(null);

  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const detail = (e as CustomEvent<ProviderDetail>).detail;
      setAnnounced((prev) =>
        prev.some((d) => d.info.uuid === detail.info.uuid) ? prev : [...prev, detail],
      );
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  const setWallet = useCallback((addr: string | null, name: string | null, provider: Eip1193Provider | null = null) => {
    addressRef.current = addr;
    providerRef.current = provider;
    setAddress(addr);
    setWalletName(name);
  }, []);

  const finish = useCallback((addr: string | null) => {
    setOpen(false);
    resolverRef.current?.(addr);
    resolverRef.current = null;
  }, []);

  const openPicker = useCallback(() => {
    setError(null);
    setBusy(null);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setOpen(true);
  }, []);

  const connect = useCallback(() => {
    if (addressRef.current) return Promise.resolve(addressRef.current);
    openPicker();
    return new Promise<string | null>((resolve) => (resolverRef.current = resolve));
  }, [openPicker]);

  const disconnect = useCallback(() => setWallet(null, null), [setWallet]);

  const options = useMemo<Option[]>(() => {
    const used = new Set<string | undefined>();
    const find = (w: WalletDef): ProviderDetail | null => {
      const d = announced.find(
        (d) => (w.rdns && d.info.rdns === w.rdns) || (w.match && w.match.test(d.info.name)),
      );
      if (d) return d;
      const eth = typeof window !== "undefined" ? window.ethereum : undefined;
      if (eth && w.legacy) {
        const list = eth.providers?.length ? eth.providers : [eth];
        const p = list.find((x) => w.legacy?.(x));
        if (p) return { info: { name: w.name }, provider: p };
      }
      return null;
    };
    const list: Option[] = WALLETS.map((w) => {
      const detail = w.soon ? null : find(w);
      if (detail?.info.uuid) used.add(detail.info.uuid);
      return { ...w, detail };
    });
    // any other installed wallet that announced itself
    for (const d of announced) {
      if (!used.has(d.info.uuid)) list.push({ id: d.info.uuid ?? d.info.name, name: d.info.name, detail: d });
    }
    list.sort((a, b) => Number(!!b.detail) - Number(!!a.detail));
    return list;
    // `open` re-evaluates legacy providers each time the picker opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announced, open]);

  const choose = async (w: Option) => {
    setError(null);
    if (w.demo) {
      const addr = "0x" + randHex(40);
      setWallet(addr, "Demo wallet");
      return finish(addr);
    }
    if (!w.detail) {
      if (w.install) window.open(w.install, "_blank", "noopener");
      return;
    }
    const { provider } = w.detail;
    setBusy(w.id);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const acc = accounts?.[0];
      if (!acc) throw new Error("No account returned");
      setWallet(acc, w.name, provider);
      provider.on?.("accountsChanged", ((accs: string[]) => {
        if (providerRef.current !== provider) return;
        if (accs[0]) setWallet(accs[0], w.name, provider);
        else setWallet(null, null);
      }) as (...args: never[]) => void);
      finish(acc);
    } catch (err) {
      const code = (err as { code?: number })?.code;
      setError(code === 4001 ? "Connection request was rejected in your wallet." : `Couldn’t connect to ${w.name}. Please try again.`);
    } finally {
      setBusy(null);
    }
  };

  const confirmLaunch = useCallback(async (req: LaunchRequest) => {
    const provider = providerRef.current;
    const addr = addressRef.current;
    if (provider && addr) {
      const message = [req.title, ...req.lines.map(([k, v]) => `${k}: ${v}`), "", "Signing does not cost gas."].join("\n");
      try {
        await provider.request({ method: "personal_sign", params: [toHex(message), addr] });
        return true;
      } catch {
        return false; // rejected (4001) or the wallet failed to sign
      }
    }
    return new Promise<boolean>((resolve) => setConfirm({ ...req, resolve }));
  }, []);

  const settleConfirm = (ok: boolean) => {
    confirm?.resolve(ok);
    setConfirm(null);
  };

  const value = useMemo(
    () => ({ address, walletName, connect, openPicker, disconnect, confirmLaunch }),
    [address, walletName, connect, openPicker, disconnect, confirmLaunch],
  );

  const demo: Option = { id: "demo", name: "Demo wallet", demo: true, detail: null };

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : finish(addressRef.current))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <span className="text-signal">$</span> connect --wallet
            </DialogTitle>
            <DialogDescription>Choose how you’d like to connect to Robinhood Chain.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {options.map((w) => (
              <WalletRow key={w.id} w={w} busy={busy === w.id} onClick={() => choose(w)} />
            ))}
            <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{"// just exploring?"}</p>
            <WalletRow w={demo} busy={false} onClick={() => choose(demo)} />
          </div>

          {error ? (
            <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <LockIcon className="size-3.5" /> Zoza never asks for your private keys or seed phrase.
          </p>
        </DialogContent>
      </Dialog>

      {/* demo wallet's stand-in for a wallet's signature prompt */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && settleConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <span className="text-signal">$</span> confirm --launch
            </DialogTitle>
            <DialogDescription>
              {walletName ?? "Your wallet"} · {address ? address.slice(0, 6) + "…" + address.slice(-4) : ""}
            </DialogDescription>
          </DialogHeader>
          {confirm ? (
            <>
              <div className="border border-border bg-card/50 p-4">
                <p className="mb-3 font-semibold">{confirm.title}</p>
                <dl className="space-y-2 text-xs">
                  {confirm.lines.map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2">
                      <dt className="shrink-0 text-muted-foreground">{k}</dt>
                      <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-border" />
                      <dd className="truncate text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="text-xs text-muted-foreground">
                Demo wallet — confirming simulates the launch. No real transaction is sent.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => settleConfirm(false)}>
                  Reject
                </Button>
                <Button variant="signal" onClick={() => settleConfirm(true)}>
                  Confirm launch
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

function WalletRow({ w, busy, onClick }: { w: Option; busy: boolean; onClick: () => void }) {
  const icon = w.detail?.info.icon && /^data:image\//.test(w.detail.info.icon) ? w.detail.info.icon : null;
  return (
    <button
      type="button"
      disabled={w.soon || busy}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 border border-border bg-card/50 px-3 py-2.5 text-left text-sm transition-colors",
        "hover:border-foreground/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card/50",
        busy && "border-signal",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden border border-border bg-background text-xs font-semibold">
        {w.demo ? (
          <Logo className="size-6" animated={false} />
        ) : icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" className="size-full object-cover" />
        ) : (
          w.name[0]
        )}
      </span>
      <span className="flex-1 font-medium">{w.name}</span>
      {busy ? (
        <Badge variant="success">
          <LoaderIcon className="animate-spin" /> Connecting
        </Badge>
      ) : w.soon ? (
        <Badge>Soon</Badge>
      ) : w.demo ? (
        <Badge>No install</Badge>
      ) : w.detail ? (
        <Badge variant="success">● Detected</Badge>
      ) : (
        <Badge>
          Install <ArrowUpRightIcon />
        </Badge>
      )}
    </button>
  );
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
