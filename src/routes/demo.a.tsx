import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/landing/footer";
import { HeroPhone } from "@/components/landing/hero-phone";
import {
  DemoClosingCta,
  DemoFaq,
  DemoHoneycomb,
  DemoLandingHeader,
  DemoPageShell,
  DemoSteelFeature,
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

      <DemoSteelFeature heading="Reviews the work. Drafts the summaries.">
        Nectar reviews notes already in Hive and drafts monthly and quarterly summaries from that
        same record. A person still reads and attests. It does not invent documentation.
      </DemoSteelFeature>

      <DemoFaq />
      <DemoClosingCta heading="See Hive with your own day." />
      <Footer />
    </DemoPageShell>
  );
}
