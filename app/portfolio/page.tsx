import type { Metadata } from "next";

import { PageShell } from "@/components/site/page-shell";
import { Portfolio } from "@/components/site/portfolio";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Everything your wallet holds across Zoza, read live from Robinhood Chain.",
};

export default function Page() {
  return (
    <PageShell>
      <Portfolio />
    </PageShell>
  );
}
