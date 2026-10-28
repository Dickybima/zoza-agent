import type { Metadata } from "next";

import { Explore } from "@/components/site/explore";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Explore",
  description: "Every token launched through the Zoza agent.",
};

export default function Page() {
  return (
    <PageShell>
      <Explore />
    </PageShell>
  );
}
