import type { Metadata } from "next";

import { PageShell } from "@/components/site/page-shell";
import { Terminal } from "@/components/site/terminal";

export const metadata: Metadata = {
  title: "Terminal",
  description: "Swap Zoza tokens on Robinhood Chain by typing what you want.",
};

export default function Page() {
  return (
    <PageShell>
      <Terminal />
    </PageShell>
  );
}
