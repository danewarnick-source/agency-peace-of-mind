import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Menu, X, ArrowRight, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Footer } from "@/components/landing/footer";
import { HexBackdrop as HexBg } from "@/components/brand/hex-backdrop";
import { HiveWordmark } from "@/components/brand/hive-mark";
import { HeroPhone } from "@/components/landing/hero-phone";
import {
  FrameComplianceTraining,
  FrameDocumentationHrc,
  FrameNectarOnTheWork,
  FrameSchedulerBoard,
} from "@/components/landing/product-frames";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hive — Software that already speaks the Utah DSPD Scope of Work" },
      {
        name: "description",
        content:
          "Hive is built for Utah DSPD providers on the Community Supports Waiver. DHHS91172 arrives loaded. Nectar reviews notes, drafts summaries, and sits on the punch and the incident — so the evening is not a second job.",
      },
      {
        property: "og:title",
        content: "Hive — Software that already speaks the Utah DSPD Scope of Work",
      },
      {
        property: "og:description",
        content:
          "Built for Utah DSPD providers on the Community Supports Waiver. The contract is on the desk. Nectar gives the evening back.",
      },
    ],
  }),
  component: HiveLandingPage,
});

function Honeycomb({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <HexBg opacity={0.12} />
    </div>
  );
}

const NAV_LINKS = [
  ["#nectar", "Nectar"],
  ["#compliance", "Compliance"],
  ["#documentation", "Documentation"],
  ["#scheduler", "Scheduler"],
] as const;

function HiveLandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--hive-bg)] text-[var(--hive-text)]">
      <nav className="sticky top-0 z-50 border-b border-[var(--hive-border)] bg-[color-mix(in_srgb,var(--hive-bg)_92%,transparent)] pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <HiveWordmark to="/" tone="canvas" />

          <div className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]"
              >
                {label}
              </a>
            ))}
            <Link to="/pricing" className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]">
              Pricing
            </Link>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Get started</Link>
            </Button>
          </div>

          <button
            onClick={() => setMobileOpen((s) => !s)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--hive-border)] text-[var(--hive-text)] md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-[var(--hive-border)] bg-[var(--hive-bg)] md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
              {NAV_LINKS.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-[var(--hive-surface)]"
                >
                  {label}
                </a>
              ))}
              <Link
                to="/pricing"
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-[var(--hive-surface)]"
              >
                Pricing
              </Link>
              <div className="mt-2 flex gap-2 pt-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="flex-1">
                  <Link to="/signup">Get started</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <header className="relative overflow-hidden bg-[var(--hive-bg)]">
        <Honeycomb />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-20">
          <div className="lg:col-span-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              Utah DSPD · Medicaid HCBS
            </p>
            <h1 className="font-display mt-3 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--hive-text)] sm:text-5xl lg:text-[3.15rem]">
              Finally, software that already speaks the Scope of Work.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--hive-text-muted)]">
              Built for Utah DSPD providers on the Community Supports Waiver. DHHS91172 arrives
              loaded. The punch, the shift note, and the incident already have Nectar on them —
              so the evening is not spent reconstructing the day.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/signup">
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <HeroPhone className="lg:translate-x-2 lg:-rotate-2" />
          </div>
        </div>
      </header>

      <section id="nectar" className="relative overflow-hidden bg-[var(--hive-sidebar)] text-[var(--hive-chrome-text)]">
        <Honeycomb />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8 lg:py-24">
          <div className="lg:col-span-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hive-gold)]/30 bg-[color-mix(in_srgb,var(--hive-gold)_12%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--hive-gold)]">
              Nectar
            </span>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              Time back — because the day is already in Hive.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--hive-chrome-text)]/80">
              Nectar reviews shift notes against the Scope of Work so a quality manager is not
              rereading every note for contract compliance. It drafts monthly and quarterly
              summaries from work already captured — staff did the day; the summary is not another
              writing assignment. Punches, notes, and incidents are already in its path. It tracks,
              flags, and drafts. A person still attests. It does not file UPI to the state.
            </p>
          </div>
          <div className="lg:col-span-7">
            <FrameNectarOnTheWork />
          </div>
        </div>
      </section>

      <section id="compliance" className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8">
          <div className="lg:col-span-5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              Compliance
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Compliance that arrives loaded.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--hive-text-muted)]">
              The register is loaded from the Utah DSPD contract. Client-specific training is cited
              to the Scope of Work —{" "}
              <span className="font-medium text-[var(--hive-text)]">
                SOW §1.8(4)(O) — Person-Specific Training
              </span>
              — tracked in Hive, with the section explanation on the row. Not an LMS checklist
              invented at month-end.
            </p>
          </div>
          <div className="lg:col-span-7">
            <FrameComplianceTraining />
          </div>
        </div>
      </section>

      <section id="documentation" className="bg-[var(--hive-canvas)] py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8">
          <div className="order-2 lg:order-1 lg:col-span-7">
            <FrameDocumentationHrc />
          </div>
          <div className="order-1 lg:order-2 lg:col-span-5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              Documentation
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              The desk already knows DSPD.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--hive-text-muted)]">
              Records, incidents, forms, audit packets, and the Human Rights Committee live on one
              desk. Rights restrictions carry the HCBS Settings Rule elements a reviewer expects.
            </p>
          </div>
        </div>
      </section>

      <section id="scheduler" className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8">
          <div className="lg:col-span-5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              Scheduler
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              A board that schedules the waiver.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--hive-text-muted)]">
              Staff, people served, and time windows on one board. Authorizations and EVV where the
              contract requires them — not a generic workforce calendar with Utah added later.
            </p>
          </div>
          <div className="lg:col-span-7">
            <FrameSchedulerBoard />
          </div>
        </div>
      </section>

      <section className="bg-[var(--hive-canvas)] py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <GraduationCap className="mx-auto h-7 w-7 text-[var(--hive-gold)]" />
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Thirty-day orientation, cited to the SOW.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--hive-text-muted)]">
            Scenario-based modules map to the Utah rule. The auditor packet carries section cites
            next to the completion record — not a generic onboarding playlist.
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
              Questions a DSPD director actually asks.
            </h2>
          </div>

          <Accordion
            type="single"
            collapsible
            className="mt-10 divide-y divide-[var(--hive-border)] rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] px-6"
          >
            {[
              {
                q: "Is this built for Utah DSPD, or is Utah a filter on a national product?",
                a: "Hive is built for Utah DSPD providers on the Community Supports Waiver. The compliance register is loaded from DHHS91172. Obligations, forms, and the Human Rights Committee are first-class — not a later configuration.",
              },
              {
                q: "We run residential, employment, or respite. Is this still for us?",
                a: "Yes. Hive is for Utah DSPD agencies on the Community Supports Waiver. The staff phone may show a Host Home note because that is a real screen. The pitch is the contract and the time Nectar gives back — not one service line.",
              },
              {
                q: "What does HHS mean on the staff phone?",
                a: "Host Home Supports — a Utah DSPD service. Not home health. The screenshot is an example of a staff caseload, not a claim that every agency runs host homes.",
              },
              {
                q: "What is Nectar?",
                a: "Nectar is Hive's intelligence layer. It reviews shift notes against the Scope of Work, drafts monthly and quarterly summaries from data already in Hive, and sits on the punch and the incident so those three things are not a hunt. It tracks, flags, and drafts. It does not invent documentation, file UPI to the state, or act unreviewed. A person still attests.",
              },
              {
                q: "How is pricing structured?",
                a: "See the pricing page. Implementation is a conversation.",
              },
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-0">
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

      <section className="relative overflow-hidden bg-[var(--hive-canvas)]">
        <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--hive-text)] sm:text-5xl">
            Sit at a desk that already knows the waiver.
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
