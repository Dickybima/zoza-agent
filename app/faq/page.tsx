import type { Metadata } from "next";

import { Faq } from "@/components/site/faq";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about Zoza, ownership, fees, and security.",
};

export default function Page() {
  return (
    <PageShell>
      <Faq />
    </PageShell>
  );
}
