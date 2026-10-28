import type { ReactNode } from "react";

/** Offsets a menu page below the fixed header and fills the viewport. */
export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-[calc(100dvh-4rem)] pt-[5.25rem]">{children}</div>;
}
