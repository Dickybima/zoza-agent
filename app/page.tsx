import { BurnTracker } from "@/components/site/burn-tracker";
import { Cta } from "@/components/site/cta";
import { Directory } from "@/components/site/directory";
import { HolderBoard } from "@/components/site/holder-board";
import { Hero } from "@/components/site/hero";
import { Stats } from "@/components/site/stats";

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <BurnTracker />
      <HolderBoard />
      <Directory />
      <Cta />
    </>
  );
}
