import type { Metadata } from "next";

import { AgentConsole } from "@/components/site/agent-console";

export const metadata: Metadata = {
  title: "Agent",
  description: "Talk to the Zoza agent and launch a token on Robinhood Chain.",
};

// Full-viewport orb stage: it sits under the fixed header instead of in a PageShell.
export default function Page() {
  return <AgentConsole />;
}
