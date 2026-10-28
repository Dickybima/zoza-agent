import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("relative border-t border-dashed border-border", className)}>
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 md:py-28">{children}</div>
    </section>
  );
}

/** `[ 02 ] CAPABILITIES` eyebrow + title + optional lede */
export function SectionHeading({
  index,
  label,
  title,
  children,
  className,
}: {
  index: string;
  label: string;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-12 max-w-2xl", className)}>
      <p className="mb-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <span className="text-signal">[ {index} ]</span> {label}
      </p>
      <h2 className="text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl md:text-4xl">
        {title}
      </h2>
      {children ? <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{children}</p> : null}
    </div>
  );
}
