import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/landing/footer";
import { HiveMark } from "@/components/brand/hive-mark";
import { HeroPhone } from "@/components/landing/hero-phone";
import {
  DemoHoneycomb,
  DemoLandingHeader,
  DemoPageShell,
  DemoSteelCta,
} from "@/components/landing/demo-landing";

export const Route = createFileRoute("/demo/c")({
  head: () => ({
    meta: [
      { title: "Hive — Run the agency without chasing the paperwork" },
      {
        name: "description",
        content: "Software that already knows this work. Hours, notes, and incidents in one place.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DemoCPage,
});

const NAV = [
  { href: "#stop-chasing", label: "What you stop" },
  { href: "#nectar", label: "Nectar" },
] as const;

const STOPS = [
  {
    title: "Stop chasing clock-ins.",
    body: "Staff clock in on the phone. You can see who is on shift without a group text.",
  },
  {
    title: "Stop chasing notes.",
    body: "Daily notes are written during the shift, while the day is still in front of people.",
  },
  {
    title: "Stop chasing incidents.",
    body: "Nectar helps capture what happened in the moment and routes it to the people who need to know.",
  },
];

function DemoCPage() {
  return (
    <DemoPageShell>
      <DemoLandingHeader links={NAV} />

      <header className="relative z-0 overflow-hidden bg-[var(--hive-bg)]">
        <DemoHoneycomb />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-20">
          <div className="order-2 lg:order-1 lg:col-span-5">
            <HeroPhone slim />
          </div>
          <div className="order-1 lg:order-2 lg:col-span-7">
            <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-[var(--hive-text)] sm:text-5xl lg:text-[3.15rem]">
              Run the agency without chasing the paperwork.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--hive-text-muted)]">
              Software that already knows this work. Hours, notes, and incidents in one place.
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
        </div>
      </header>

      <section id="stop-chasing" className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
            What you stop chasing
          </p>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            The hunt is the job. It does not have to be.
          </h2>
          <ol className="mt-10 space-y-0">
            {STOPS.map((item, index) => (
              <li
                key={item.title}
                className="border-t border-[var(--hive-border)] py-8 last:border-b"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hive-gold)]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="font-display mt-2 text-2xl font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-[var(--hive-text-muted)]">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
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
            The record is already there. Ask it.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--hive-chrome-text)]/80">
            Nectar watches hours, notes, and incidents in Hive. It drafts summaries from work
            already captured. A person still attests. It does not invent documentation.
          </p>
        </div>
      </section>

      <section className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
            Who this is for
          </span>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Newer agencies. Same day. One desk.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--hive-text-muted)]">
            Built for Utah teams that support people with disabilities and are tired of chasing the
            paperwork across phones, folders, and inboxes.
          </p>
        </div>
      </section>

      <DemoSteelCta heading="Get a walkthrough.">
        See how hours, notes, and incidents stay in one place.
      </DemoSteelCta>
      <Footer />
    </DemoPageShell>
  );
}
