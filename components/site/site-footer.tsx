import { Logo } from "@/components/site/logo";

const LINKS = [
  { href: "https://x.com/usezoza", label: "X" },
];

export function SiteFooter() {
  // evaluated once at build time (static export)
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5 font-semibold tracking-[0.2em]">
          <Logo className="size-6" animated={false} />
          ZOZA
        </div>
        <p className="text-xs text-muted-foreground">
          © {year} zoza agent <span className="text-signal">{"//"}</span> engineered on robinhood chain
        </p>
        <nav className="flex gap-5 text-muted-foreground">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
