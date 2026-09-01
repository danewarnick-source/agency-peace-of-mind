import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Footer } from "@/components/landing/footer";
import { HiveMark } from "@/components/brand/hive-mark";
import { HeroPhone } from "@/components/landing/hero-phone";
import {
  DemoHoneycomb,
  DemoLandingHeader,
  DemoPageShell,
  DemoSteelCta,
} from "@/components/landing/demo-landing";

export const Route = createFileRoute("/demo/a")({
  head: () => ({
    meta: [
      { title: "Hive — The day stays in one place" },
      {
        name: "description",
        content:
          "Clock-ins, notes, and incidents live in Hive. Nectar watches them so you don’t have to chase them later.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DemoAPage,
});

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#nectar", label: "Nectar" },
  { href: "#faq", label: "FAQ" },
] as const;

const CARDS = [
  {
    icon: Clock,
    title: "Clock-ins that actually happen",
    body: "Staff clock in on the phone, from the place they work. You see who showed up.",
  },
  {
    icon: FileText,
    title: "Notes that are already written",
    body: "Daily notes get written during the shift, while the details are still fresh.",
  },
  {
    icon: ShieldAlert,
    title: "Incidents that don’t get lost",
    body: "When something happens, it is captured in the moment and routed to the people who need it.",
  },
];

const FAQ = [
  {
    q: "What is Nectar?",
    a: "Nectar is Hive’s intelligence layer. It reviews notes, drafts monthly and quarterly summaries from records already in Hive, and answers questions in plain English. A person still attests. It does not invent documentation.",
  },
  {
    q: "Who is this for?",
    a: "Utah agencies that support people with disabilities — especially newer providers who want hours, notes, and incidents in one place instead of a stack of apps and spreadsheets.",
  },
  {
    q: "How does pricing work?",
    a: "See the pricing page. Implementation is a conversation.",
  },
];

function DemoAPage() {
  return (
    <DemoPageShell>
      <DemoLandingHeader links={NAV} />

      <header className="relative z-0 overflow-hidden bg-[var(--hive-bg)]">
        <DemoHoneycomb />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-20">
          <div className="lg:col-span-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              For Utah disability agencies
            </p>
            <h1 className="font-display mt-3 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--hive-text)] sm:text-5xl lg:text-[3.15rem]">
              The day stays in one place.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--hive-text-muted)]">
              Clock-ins, notes, and incidents live in Hive. Nectar watches them so you don’t have to
              chase them later.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/signup">
                  Get a walkthrough <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>
          <div className="lg:col-span-6">
            <HeroPhone slim className="lg:translate-x-2" />
          </div>
        </div>
      </header>

      <section id="features" className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {CARDS.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-6 shadow-[var(--shadow-soft)]"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--hive-border)] bg-[var(--hive-canvas)]">
                <Icon className="h-4 w-4 text-[var(--hive-gold)]" strokeWidth={1.7} />
              </span>
              <h2 className="font-display mt-4 text-xl font-semibold tracking-tight">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--hive-text-muted)]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="nectar"
        className="relative overflow-hidden bg-[var(--hive-sidebar)] text-[var(--hive-chrome-text)]"
      >
        <DemoHoneycomb />
        <div className="relative mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hive-gold)]/30 bg-[color-mix(in_srgb,var(--hive-gold)_12%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--hive-gold)]">
            <HiveMark className="h-3.5 w-3.5" />
            Nectar
          </span>
          <h2 className="font-display mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            Reviews the work. Drafts the summaries.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--hive-chrome-text)]/80">
            Nectar reviews notes already in Hive and drafts monthly and quarterly summaries from
            that same record. A person still reads and attests. It does not invent documentation.
          </p>
        </div>
      </section>

      <section id="faq" className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              FAQ
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              A few plain questions.
            </h2>
          </div>
          <Accordion
            type="single"
            collapsible
            className="mt-10 divide-y divide-[var(--hive-border)] rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] px-6"
          >
            {FAQ.map((item, i) => (
              <AccordionItem key={item.q} value={`item-${i}`} className="border-0">
                <AccordionTrigger className="py-5 text-left font-display text-base font-semibold hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-relaxed text-[var(--hive-text-muted)]">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <DemoSteelCta heading="See Hive with your own day.">
        A short walkthrough. Bring the questions you actually have.
      </DemoSteelCta>
      <Footer />
    </DemoPageShell>
  );
}
