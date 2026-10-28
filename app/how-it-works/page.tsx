import type { Metadata } from "next";

import { HowItWorks } from "@/components/site/how-it-works";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "How it works",
  description: "Four commands from idea to a live token on Robinhood Chain.",
};

export default function Page() {
  return (
    <PageShell>
      <HowItWorks />
    </PageShell>
  );
}
