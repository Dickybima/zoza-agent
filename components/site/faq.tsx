import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Section, SectionHeading } from "@/components/site/section";

const FAQ = [
  {
    q: "What is Zoza?",
    a: "Zoza is an AI agent that turns human language into on-chain tokens on Robinhood Chain — bridging ideas and the blockchain without technical middlemen.",
  },
  { q: "Do I need to know how to code?", a: "Not at all. You bring the vision; Zoza handles the contract architecture, security, and launch." },
  {
    q: "Who owns the tokens I create?",
    a: "You launch it from your own wallet and you are recorded as its creator, so the creator tax is paid straight to you. The full supply goes into a bonding curve that graduates into a permanently locked liquidity pool — nobody, Zoza included, can pull that liquidity.",
  },
  {
    q: "What about fees and taxes?",
    a: "Launching costs the launchpad’s launch fee plus Robinhood Chain gas — both are shown in your wallet before you confirm. Every token carries a 3% tax on buys and sells: 2% flows directly to the token creator’s wallet, and 1% is the launchpad’s protocol fee.",
  },
  {
    q: "How secure is Zoza?",
    a: "Zoza is built on proven contract architecture and will never ask for your private keys. As always, do your own research (DYOR) before investing.",
  },
];

export function Faq() {
  return (
    <Section id="faq">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading index="07" label="FAQ" title="Everything you’ll want to know." />
        <Accordion type="single" collapsible className="border-t border-border">
          {FAQ.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`}>
              <AccordionTrigger>
                <span>
                  <span className="mr-3 text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {f.q}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pl-9">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
