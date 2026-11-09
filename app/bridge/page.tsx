import type { Metadata } from "next";

import { Bridge } from "@/components/site/bridge";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Bridge",
  description: "Bridge HYPE between HyperEVM and Elysium through Elysium's canonical bridge.",
};

export default function Page() {
  return (
    <PageShell>
      <Bridge />
    </PageShell>
  );
}
