import type { Metadata } from "next";

import { Network } from "@/components/site/network";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Network",
  description: "Zoza runs natively on Robinhood Chain.",
};

export default function Page() {
  return (
    <PageShell>
      <Network />
    </PageShell>
  );
}
