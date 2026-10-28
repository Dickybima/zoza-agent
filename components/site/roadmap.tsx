import { cn } from "@/lib/utils";
import { Section, SectionHeading } from "@/components/site/section";

const PHASES = [
  { n: "01", name: "Genesis", pct: 100, body: "The birth of the Zoza agent — conversational token creation and native launches on Robinhood Chain." },
  { n: "02", name: "Liquidity", pct: 60, body: "Automated pools, LP locking, and a creator dashboard for full command of your market." },
  { n: "03", name: "Agent Orchestra", pct: 0, body: "Marketing, community, and analytics agents collaborating as one seamless team." },
  { n: "04", name: "Open Ecosystem", pct: 0, body: "The Zoza SDK and API for builders, plus bridges to other networks." },
];

const bar = (pct: number, w = 20) => {
  const filled = Math.round((pct / 100) * w);
  return "█".repeat(filled) + "░".repeat(w - filled);
};

export function Roadmap() {
  return (
    <Section id="roadmap">
      <SectionHeading index="06" label="Trajectory" title="A vision that keeps evolving." />
      <ol className="border border-border">
        {PHASES.map((p) => {
          const state = p.pct === 100 ? "complete" : p.pct > 0 ? "in progress" : "queued";
          return (
            <li
              key={p.n}
              className="grid gap-3 border-b border-dashed border-border p-5 last:border-b-0 sm:p-6 md:grid-cols-[10rem_1fr_auto] md:items-center md:gap-8"
            >
              <div>
                <p className="text-xs text-muted-foreground">PHASE_{p.n}</p>
                <p className="font-semibold">{p.name}</p>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              <div className="text-xs md:text-right">
                <p className={cn("tracking-tight", p.pct > 0 ? "text-signal" : "text-muted-foreground/60")}>
                  [{bar(p.pct)}] {String(p.pct).padStart(3, " ")}%
                </p>
                <p className="mt-1 text-muted-foreground">{state}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
