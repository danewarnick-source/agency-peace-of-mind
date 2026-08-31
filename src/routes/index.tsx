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
import { FounderStory } from "@/components/landing/founder-story";
import { HexBackdrop as HexBg } from "@/components/brand/hex-backdrop";
import { HiveWordmark } from "@/components/brand/hive-mark";
import { HeroPhonePortrait, HeroPhoneWide } from "@/components/landing/hero-phone";
import {
  FrameAskNectar,
  FrameComplianceTraining,
  FrameDocumentationHrc,
  FrameSchedulerSlhDsi,
} from "@/components/landing/product-frames";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hive — Software that already speaks the Utah DSPD Scope of Work" },
      {
        name: "description",
        content:
          "Hive is built for Utah DSPD agencies on the Community Supports Waiver. DHHS91172 obligations, SLH, DSI, Host Home Supports, and the Human Rights Committee — without year one spent teaching a national care app the contract.",
      },
      {
        property: "og:title",
        content: "Hive — Software that already speaks the Utah DSPD Scope of Work",
      },
      {
        property: "og:description",
        content:
          "Built for DSPD agencies on the Community Supports Waiver. The obligations, the forms, the codes.",
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

function HeroCopy() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
        Utah DSPD · Medicaid HCBS
      </p>
      <h1 className="font-display mt-3 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--hive-text)] sm:text-5xl lg:text-[2.85rem] xl:text-[3.15rem]">
        Finally, software that already speaks the Scope of Work.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--hive-text-muted)]">
        Built for DSPD agencies on the Community Supports Waiver. The DHHS91172 obligations,
        the forms, the codes. You do not spend year one teaching a national care app what SLH,
        DSI, Host Home, and the Human Rights Committee are.
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
    </>
  );
}

function HiveLandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--hive-bg)] text-[var(--hive-text)]">
      <nav className="sticky top-0 z-50 border-b border-[var(--hive-border)] bg-[color-mix(in_srgb,var(--hive-bg)_92%,transparent)] backdrop-blur-md">
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
        <div className="relative hidden lg:block">
          <HeroPhoneWide />
          <div className="pointer-events-none absolute inset-0">
            <div className="mx-auto flex h-full max-w-7xl items-center justify-end px-8">
              <div className="pointer-events-auto w-[min(36rem,50%)]">
                <HeroCopy />
              </div>
            </div>
          </div>
        </div>

        <div className="relative px-4 py-14 sm:px-6 lg:hidden">
          <Honeycomb />
          <div className="relative">
            <HeroCopy />
            <div className="mt-10">
              <HeroPhonePortrait />
            </div>
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
              Nectar already speaks DSPD.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--hive-chrome-text)]/80">
              Ask Nectar on caseload, training, and PCSP goals. It lives in the staff chrome (⌘K).
              It advises and flags. A human still attests. The Scope of Work proof sits in
              Compliance — not in a chat transcript.
            </p>
          </div>
          <div className="lg:col-span-7">
            <FrameAskNectar />
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
              Client-specific training is cited to the contract —{" "}
              <span className="font-medium text-[var(--hive-text)]">
                SOW §1.8(4)(O) — Person-Specific Training
              </span>
              . Tracked in Hive, with Details &amp; SOW explanation. Not an LMS checklist you invent
              at month-end.
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
              Records, Incidents, Forms, Audit, and Human Rights Committee. Daily logs for Host Home
              Supports — never home health. EVV timesheets when the code needs them.
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
              A board that schedules SLH and DSI.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--hive-text-muted)]">
              Supported Living and Individual Day Support as first-class services. Host Home does
              not clock — the host's artifact is the daily note.
            </p>
          </div>
          <div className="lg:col-span-7">
            <FrameSchedulerSlhDsi />
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

      <FounderStory />

      <section id="faq" className="bg-[var(--hive-canvas)] py-20 sm:py-24">
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
                a: "Hive is built for DSPD agencies on the Community Supports Waiver. The compliance register is loaded from DHHS91172. Service codes, Host Home daily notes, and the Human Rights Committee are first-class — not a later configuration.",
              },
              {
                q: "What does HHS mean here?",
                a: "Host Home Supports. Not home health. Hosts do not clock. The host's artifact is the daily note and overnight confirmation. Agency staff visits into a host home are timed shifts.",
              },
              {
                q: "What is Nectar?",
                a: "Nectar is Hive's intelligence layer. Staff can ask about PCSP goals, training, and the people on their caseload from the staff chrome (⌘K). It coaches notes for completeness. It does not invent documentation, file UPI, or act unreviewed. The SOW proof lives on Compliance — for example Client-Specific Training cited to §1.8(4)(O).",
              },
              {
                q: "Do you support SLH, DSI, and the Human Rights Committee?",
                a: "Yes. The scheduler groups clocked codes such as SLH Supported Living and DSI Individual Day Support. Documentation includes a Human Rights Committee tab for rights restrictions under SOW §1.20 / the HCBS Settings Rule.",
              },
              {
                q: "How is pricing structured?",
                a: "See the pricing page. Implementation is a conversation with people who have billed the waiver.",
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

      <section className="relative overflow-hidden bg-[var(--hive-bg)]">
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
