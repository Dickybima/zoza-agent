import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Card with ASCII "+" registration marks on each corner, matching the
 * terminal look of the hero tunnel.
 */
function Card({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "group/card relative flex flex-col gap-4 border border-border bg-card/60 p-6 text-card-foreground transition-colors hover:border-foreground/30",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="pointer-events-none absolute -left-[5px] -top-[11px] text-xs text-muted-foreground/70 transition-colors group-hover/card:text-signal">+</span>
      <span aria-hidden className="pointer-events-none absolute -right-[5px] -top-[11px] text-xs text-muted-foreground/70 transition-colors group-hover/card:text-signal">+</span>
      <span aria-hidden className="pointer-events-none absolute -bottom-[10px] -left-[5px] text-xs text-muted-foreground/70 transition-colors group-hover/card:text-signal">+</span>
      <span aria-hidden className="pointer-events-none absolute -bottom-[10px] -right-[5px] text-xs text-muted-foreground/70 transition-colors group-hover/card:text-signal">+</span>
      {children}
    </div>
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-2", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 data-slot="card-title" className={cn("text-base font-semibold leading-snug", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("mt-auto flex items-center gap-2", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
