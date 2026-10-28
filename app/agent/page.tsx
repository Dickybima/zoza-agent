import type { Metadata } from "next";

import { AgentConsole } from "@/components/site/agent-console";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Agent",
  description: "Talk to the Zoza agent and launch a token on Robinhood Chain.",
};

export default function Page() {
  return (
    <PageShell>
      <AgentConsole />
    </PageShell>
  );
}
