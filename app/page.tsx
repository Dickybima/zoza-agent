import { AgentConsole } from "@/components/site/agent-console";
import { Cta } from "@/components/site/cta";
import { Explore } from "@/components/site/explore";
import { Faq } from "@/components/site/faq";
import { Features } from "@/components/site/features";
import { Hero } from "@/components/site/hero";
import { HowItWorks } from "@/components/site/how-it-works";
import { Network } from "@/components/site/network";
import { Roadmap } from "@/components/site/roadmap";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Stats } from "@/components/site/stats";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Stats />
        <Features />
        <HowItWorks />
        <AgentConsole />
        <Explore />
        <Network />
        <Roadmap />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
}
