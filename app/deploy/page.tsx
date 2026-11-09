import type { Metadata } from "next";

import { DeployLaunchpad } from "@/components/site/deploy-launchpad";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Deploy",
  description: "Deploy the Zoza launchpad contracts on Elysium.",
  robots: { index: false },
};

export default function Page() {
  return (
    <PageShell>
      <DeployLaunchpad />
    </PageShell>
  );
}
