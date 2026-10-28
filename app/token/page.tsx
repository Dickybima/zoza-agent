import { Suspense } from "react";
import type { Metadata } from "next";

import { PageShell } from "@/components/site/page-shell";
import { TokenView } from "@/components/site/token-view";

export const metadata: Metadata = {
  title: "Token",
  description: "Price chart, transactions and trading for a token launched with Zoza on Robinhood Chain.",
};

// /token?address=0x… — the address is read on the client, so the page stays a static export
export default function Page() {
  return (
    <PageShell>
      <Suspense>
        <TokenView />
      </Suspense>
    </PageShell>
  );
}
