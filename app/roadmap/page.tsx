import type { Metadata } from "next";

import { Roadmap } from "@/components/site/roadmap";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "Where Zoza is headed next.",
};

export default function Page() {
  return (
    <PageShell>
      <Roadmap />
    </PageShell>
  );
}
