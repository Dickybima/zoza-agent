import { Section, SectionHeading } from "@/components/site/section";

const STEPS = [
  { cmd: "zoza connect", title: "Connect your identity", body: "Link your wallet to Robinhood Chain — your private keys remain yours, always." },
  { cmd: 'zoza describe "Moon Cat"', title: "Share your vision", body: "Just a name, ticker, X account, and website. That simple." },
  { cmd: "zoza review", title: "Review with care", body: "Zoza presents your token’s blueprint. Refine every detail before it’s set in stone." },
  { cmd: "zoza launch", title: "Go on-chain", body: "One signature, and your token is live on Robinhood Chain — permanent and verifiable." },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading index="02" label="The mechanics" title="Four commands. One flawless launch." />
      <ol className="grid border border-border md:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.cmd}
            className="relative border-b border-dashed border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          >
            <p className="mb-6 flex items-center justify-between text-xs text-muted-foreground">
              <span>STEP_{String(i + 1).padStart(2, "0")}</span>
              {i < STEPS.length - 1 ? <span aria-hidden className="hidden md:inline">──▶</span> : <span aria-hidden className="text-signal">● done</span>}
            </p>
            <p className="mb-4 truncate text-sm">
              <span className="text-signal">$</span> {s.cmd}
            </p>
            <h3 className="mb-2 font-semibold">{s.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
