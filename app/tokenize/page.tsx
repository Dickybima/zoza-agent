import type { Metadata } from "next";

import { PageShell } from "@/components/site/page-shell";
import { Tokenize } from "@/components/site/tokenize";

export const metadata: Metadata = {
  title: "Tokenize",
  description: "Turn a fomo or pump.fun profile into a token on Elysium.",
};

export default function Page() {
  return (
    <PageShell>
      <Tokenize />
    </PageShell>
  );
}
