import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { PAGES } from "@/lib/nav";
import { Section, SectionHeading } from "@/components/site/section";

/** Home-page index of every menu page, styled as a directory listing. */
export function Directory() {
  return (
    <Section bordered>
      <SectionHeading as="h2" index="00" label="Index" title="Where would you like to go?">
        <span className="text-signal">$</span> ls ~/zoza
      </SectionHeading>
      <ul className="border border-border">
        {PAGES.map((p) => (
          <li key={p.href} className="border-b border-dashed border-border last:border-b-0">
            <Link
              href={p.href}
              className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 px-4 py-5 transition-colors hover:bg-accent sm:grid-cols-[3rem_12rem_1fr_auto] sm:px-6"
            >
              <span className="text-xs text-muted-foreground group-hover:text-signal">{p.index}</span>
              <span className="font-semibold">
                {p.href.slice(1)}
                <span className="text-muted-foreground">/</span>
              </span>
              <span className="hidden text-sm text-muted-foreground sm:block">{p.blurb}</span>
              <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
