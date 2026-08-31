import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Menu,
  X,
  ArrowRight,
  Check,
  ClipboardList,
  Users,
  CalendarClock,
  Pill,
  FileCheck2,
  BarChart3,
  Sparkles,
  Lock,
  HeartHandshake,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Footer } from "@/components/landing/footer";
import { FounderStory } from "@/components/landing/founder-story";
import { CompetitiveContrast } from "@/components/landing/competitive-contrast";
import { HexBackdrop as HexBg } from "@/components/brand/hex-backdrop";
import { HiveWordmark } from "@/components/brand/hive-mark";
import { LandingAppPreview } from "@/components/landing/app-preview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hive — Ops, training, and compliance, visible" },
      {
        name: "description",
        content:
          "Hive unifies scheduling, EVV, eMAR, billing and compliance for HCBS and home-care agencies. Powered by Nectar, the intelligence layer that turns every shift into audit-ready proof.",
      },
      { property: "og:title", content: "Hive — Ops, training, and compliance, visible" },
      {
        property: "og:description",
        content:
          "One platform for care, compliance and operations. Powered by Nectar.",
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

const TRUST_LOGOS = ["ACME", "NORTHRIDGE", "PIVOT", "VERITAS", "SUMMIT", "LATTICE"] as const;

function HiveLandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--hive-bg)] text-[var(--hive-text)]">
      <nav className="sticky top-0 z-50 border-b border-[var(--hive-border)] bg-[color-mix(in_srgb,var(--hive-bg)_92%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <HiveWordmark to="/" />

          <div className="hidden items-center gap-8 md:flex">
            <a href="#modules" className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]">
              Product
            </a>
            <a href="#nectar" className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]">
              Nectar
            </a>
            <a href="#compliance" className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]">
              Solutions
            </a>
            <Link to="/pricing" className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]">
              Pricing
            </Link>
            <a href="#faq" className="text-sm font-medium text-[var(--hive-text)] hover:text-[var(--hive-gold)]">
              Resources
            </a>
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
              {[
                ["#modules", "Product"],
                ["#nectar", "Nectar"],
                ["#compliance", "Solutions"],
                ["#faq", "Resources"],
              ].map(([href, label]) => (
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
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-24">
          <div className="lg:col-span-6">
            <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-[var(--hive-text)] sm:text-5xl lg:text-[3.4rem]">
              Ops, training, and compliance.
              <br />
              <span className="text-[var(--hive-gold)]">Visible.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--hive-text-muted)]">
              Hive unifies scheduling, EVV, eMAR, billing and compliance into a single
              workflow. Nectar turns every visit, signature and note into audit-ready proof —
              automatically.
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
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[var(--hive-text-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[var(--hive-gold)]" /> HIPAA-grade
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[var(--hive-gold)]" /> EVV-ready (21st Century Cures)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[var(--hive-gold)]" /> State-specific HCBS coding
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <LandingAppPreview />
          </div>
        </div>
      </header>

      <section className="border-y border-[var(--hive-border)] bg-[var(--hive-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--hive-gold)]">
            Trusted by organizations that keep the world moving
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-semibold tracking-[0.18em] text-[var(--hive-text)]">
            {TRUST_LOGOS.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </section>

      <section id="modules" className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              The platform
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Finally, every part of care in one hive.
            </h2>
            <p className="mt-4 text-base text-[var(--hive-text-muted)]">
              Six modules. One source of truth. Built for the realities of community-based care —
              messy schedules, split shifts, MAR exceptions, and state audits.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: CalendarClock,
                title: "Scheduling & EVV",
                body:
                  "Build schedules in minutes. Geo + biometric punches reconcile to authorizations automatically — no missed visits, no claw-backs.",
              },
              {
                icon: Pill,
                title: "eMAR & Health",
                body:
                  "Med passes, PRN reasons, vitals and seizure logs in one timeline. Exceptions are flagged the moment they happen, not at month-end.",
              },
              {
                icon: ClipboardList,
                title: "HHS & Daily Logs",
                body:
                  "Goal-aligned documentation that writes back to service plans. Quality assurance built in, not bolted on.",
              },
              {
                icon: Users,
                title: "Workforce & Training",
                body:
                  "Onboarding, certifications, expirations and competencies. Block uncovered shifts before they go live.",
              },
              {
                icon: FileCheck2,
                title: "Billing & PBA",
                body:
                  "Claim-ready exports for Medicaid waivers. PBA ledgers, room & board, and pass-through reconciled to the penny.",
              },
              {
                icon: BarChart3,
                title: "Agency Command Center",
                body:
                  "Live KPIs for coverage, MAR adherence, EVV match rate, and authorization burn — for every program, every house, every day.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-6 transition-all hover:-translate-y-0.5 hover:border-[var(--hive-gold)]"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--hive-gold)] text-[var(--hive-gold)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--hive-text-muted)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CompetitiveContrast />

      <section id="nectar" className="relative overflow-hidden bg-[var(--hive-sidebar)] text-[var(--hive-text)]">
        <Honeycomb />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8 lg:py-24">
          <div className="lg:col-span-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hive-gold)]/30 bg-[color-mix(in_srgb,var(--hive-gold)_12%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--hive-gold)]">
              <Sparkles className="h-3.5 w-3.5" /> Nectar
            </span>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              The intelligence layer that turns
              <br />
              messy care data into proof.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--hive-text-muted)]">
              Nectar reads every shift, signature, note and pass — and quietly produces the
              paperwork the state actually asks for. No new screens for your staff. No
              month-end scramble for your QA team.
            </p>
            <ul className="mt-7 space-y-3 text-sm">
              {[
                "Auto-drafts service notes from EVV + daily-log signals",
                "Flags MAR exceptions, missed goals and EVV mismatches in real time",
                "Maps documentation to the right HCBS service codes per state",
                "Surfaces audit-ready packets in one click",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--hive-gold)] text-[var(--hive-on-gold)]">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-6">
            <div className="relative rounded-2xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-6">
              <div className="flex items-center justify-between border-b border-[var(--hive-border)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--hive-gold)]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--hive-text-muted)]">
                    Nectar · Live feed
                  </span>
                </div>
                <span className="text-[10px] text-[var(--hive-text-muted)]">just now</span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  { tag: "EVV", text: "House 14 — punch reconciled to auth #4421." },
                  { tag: "MAR", text: "PRN reason captured for K. Rivera — Tylenol 500mg." },
                  { tag: "HHS", text: "Goal #3 progress updated from today's daily log." },
                  { tag: "AUDIT", text: "Weekly compliance packet ready for review (12 programs)." },
                ].map((row, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-[var(--hive-border)] bg-[var(--hive-canvas)] p-3"
                  >
                    <span className="inline-flex h-6 shrink-0 items-center rounded bg-[var(--hive-gold)] px-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--hive-on-gold)]">
                      {row.tag}
                    </span>
                    <span>{row.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="compliance" className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8">
          <div className="lg:col-span-5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              Compliance, by default
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Audit-ready isn't a project.
              <br /> It's the platform.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--hive-text-muted)]">
              Every action in Hive is timestamped, signed, and tied to a person, an
              authorization and a service code. When the auditor calls, you don't open a
              spreadsheet — you open Hive.
            </p>
            <div className="mt-7 flex gap-3">
              <Button asChild size="lg">
                <Link to="/contact">Talk to compliance</Link>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: ShieldCheck, title: "HIPAA-grade security", body: "Encryption in transit and at rest, granular RBAC, full audit trails." },
                { icon: Lock, title: "Role & program isolation", body: "Tenant + program scoping prevents data leakage across houses, sites and contractors." },
                { icon: FileCheck2, title: "21st Century Cures EVV", body: "GPS, biometric, and FOB capture modes — all match-rated against authorizations." },
                { icon: ClipboardList, title: "State HCBS coding", body: "Service codes, modifiers and units pre-mapped per state waiver." },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-5">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--hive-gold)] text-[var(--hive-gold)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-display text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-[var(--hive-text-muted)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[var(--hive-sidebar)] text-[var(--hive-text)]">
        <Honeycomb />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <HeartHandshake className="mx-auto h-8 w-8 text-[var(--hive-gold)]" />
          <h2 className="font-display mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Care happens at the kitchen table.
            <br />
            Software shouldn't get in the way.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--hive-text-muted)]">
            Hive exists so direct support professionals can spend more time with the people
            they support — and less time fighting paperwork. Every feature is measured by one
            question: did this give a caregiver their evening back?
          </p>
        </div>
      </section>

      <FounderStory />

      <section className="bg-[var(--hive-bg)] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <ArrowRightLeft className="mx-auto h-7 w-7 text-[var(--hive-gold)]" />
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Switching from Therap, Sandata or a stack of spreadsheets?
            </h2>
            <p className="mt-4 text-base text-[var(--hive-text-muted)]">
              We move your authorizations, clients, staff and historical EVV — in days, not
              quarters. Your team keeps documenting while we mirror the old system in the
              background.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { step: "01", title: "Mirror", body: "We stand up Hive alongside your current system and reconcile data daily." },
              { step: "02", title: "Migrate", body: "Authorizations, clients, staff, certs and EVV history move with full lineage." },
              { step: "03", title: "Move on", body: "Cutover on your timeline — no missed visits, no missed claims." },
            ].map(({ step, title, body }) => (
              <div key={step} className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-6">
                <div className="font-display text-3xl font-bold text-[var(--hive-gold)]">{step}</div>
                <h3 className="mt-2 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-[var(--hive-text-muted)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-[var(--hive-canvas)] py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
              FAQ
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Questions agencies actually ask.
            </h2>
          </div>

          <Accordion type="single" collapsible className="mt-10 divide-y divide-[var(--hive-border)] rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] px-6">
            {[
              {
                q: "Which states and waivers does Hive support today?",
                a: "Hive ships with HCBS service-code libraries pre-mapped for most state Medicaid waivers, including DSPD (UT), and supports IDD, ABI, aging-and-disability, and behavioral health programs. New states are typically configured in under two weeks.",
              },
              {
                q: "Is Hive EVV compliant under the 21st Century Cures Act?",
                a: "Yes. Hive captures all six federally required EVV data points and supports GPS, biometric, and FOB modes. We integrate with state aggregators and reconcile every punch to an active authorization.",
              },
              {
                q: "What is Nectar, exactly?",
                a: "Nectar is the intelligence layer inside Hive. It reads operational signals — EVV punches, MAR entries, goal progress, signatures — and continuously assembles the documentation auditors expect. Your staff don't learn a new tool; the proof just appears.",
              },
              {
                q: "How long does implementation take?",
                a: "Most agencies are live in 4–6 weeks, including data migration from Therap, Sandata, HHAeXchange or spreadsheets. We run the old system in parallel until you're confident.",
              },
              {
                q: "How is pricing structured?",
                a: "Per active client, billed monthly, with no per-module upcharges. Implementation and migration are included in annual plans. See the pricing page for details.",
              },
              {
                q: "Where does our data live, and who can see it?",
                a: "Encrypted in transit and at rest in HIPAA-aligned US infrastructure. Role-based access plus program-level scoping means staff only ever see the clients and houses they're assigned to.",
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
            See your agency run from one hive.
          </h2>
          <p className="max-w-2xl text-base text-[var(--hive-text-muted)]">
            A 30-minute demo with someone who has actually billed a Medicaid waiver — not a
            sales script. Bring your hardest workflow.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/demo">Book a demo</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
