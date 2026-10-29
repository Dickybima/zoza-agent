import type { Metadata } from "next";

import { Claim } from "@/components/site/claim";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Claim",
  description: "Collect the creator fees your Zoza tokens earned on Robinhood Chain.",
};

export default function Page() {
  return (
    <PageShell>
      <Claim />
    </PageShell>
  );
}
