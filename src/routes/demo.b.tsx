import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock, FileText, Sparkles } from "lucide-react";
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

export const Route = createFileRoute("/demo/b")({
  head: () => ({
    meta: [
      { title: "Hive — The desk your staff actually use" },
      {
        name: "description",
        content:
          "One place for people, hours, and notes. Built for Utah agencies that support people with disabilities.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DemoBPage,
});

const NAV = [
  { href: "#hours", label: "Hours" },
  { href: "#notes", label: "Notes" },
  { href: "#nectar", label: "Nectar" },
] as const;

const BANDS = [
  {
    id: "hours",
    icon: Clock,
    label: "Hours",
    body: "Staff clock in from the phone. You see who showed up.",
  },
  {
    id: "notes",
    icon: FileText,
    label: "Notes",
    body: "Daily notes get written on shift.",
  },
  {
    id: "nectar-band",
    icon: Sparkles,
    label: "Nectar",
    body: "Ask in plain English. It already knows your records.",
  },
];

function DemoBPage() {
  return (
    <DemoPageShell>
      <DemoLandingHeader links={NAV} />

      <header className="relative z-0 overflow-hidden bg-[var(--hive-bg)]">
        <DemoHoneycomb />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-[var(--hive-text)] sm:text-5xl lg:text-[3.15rem]">
            Hive is the desk your staff actually use.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--hive-text-muted)]">
            One place for people, hours, and notes. Built for Utah agencies that support people with
            disabilities.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">
                Get a walkthrough <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#hours">See how it works</a>
            </Button>
          </div>
          <div className="mt-14">
            <HeroPhone slim className="lg:-rotate-2" />
          </div>
        </div>
      </header>

      <section className="bg-[var(--hive-bg)] pb-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          {BANDS.map(({ id, icon: Icon, label, body }, index) => (
            <div
              key={id}
              id={id}
              className={`grid items-center gap-4 py-8 sm:grid-cols-[2rem_7rem_1fr] sm:gap-8 ${
                index === 0 ? "border-t" : ""
              } border-b border-[var(--hive-border)]`}
            >
              <Icon className="h-6 w-6 text-[var(--hive-gold)]" strokeWidth={1.6} />
              <p className="font-display text-lg font-semibold text-[var(--hive-text)]">{label}</p>
              <p className="text-base leading-relaxed text-[var(--hive-text-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <DemoSteelFeature heading="Ask about the day you already have.">
        Nectar reads hours and notes already in Hive. It drafts summaries from that work. A person
        still attests. It does not invent documentation.
      </DemoSteelFeature>

      <DemoFaq />
      <DemoClosingCta heading="Put the desk on one phone." />
      <Footer />
    </DemoPageShell>
  );
}
