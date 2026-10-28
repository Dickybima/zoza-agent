import type { Metadata } from "next";

import { Features } from "@/components/site/features";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Features",
  description: "Every capability Zoza brings to a token launch.",
};

export default function Page() {
  return (
    <PageShell>
      <Features />
    </PageShell>
  );
}
