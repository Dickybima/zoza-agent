import { Cta } from "@/components/site/cta";
import { Directory } from "@/components/site/directory";
import { Hero } from "@/components/site/hero";
import { Stats } from "@/components/site/stats";

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <Directory />
      <Cta />
    </>
  );
}
