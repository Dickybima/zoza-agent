import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Section({
  id,
  className,
  bordered = false,
  children,
}: {
  id?: string;
  className?: string;
  /** dashed rule above the section, for stacking sections on one page */
  bordered?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("relative", bordered && "border-t border-dashed border-border", className)}>
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 md:py-28">{children}</div>
    </section>
  );
}

/** `[ 02 ] CAPABILITIES` eyebrow + title + optional lede. Each menu page has
 * one of these as its main heading, so it renders an h1 by default. */
export function SectionHeading({
  index,
  label,
  title,
  children,
  className,
  as: Heading = "h1",
}: {
  index: string;
  label: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn("mb-12 max-w-2xl", className)}>
      <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <span className="text-signal">[ {index} ]</span> {label}
      </p>
      <Heading className="text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl md:text-4xl">
        {title}
      </Heading>
      {children ? <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{children}</p> : null}
    </div>
  );
}
