import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Hexagon,
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
  ChevronRight,
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HIVE — Run your whole agency from one hive" },
      {
        name: "description",
        content:
          "HIVE unifies scheduling, EVV, eMAR, billing and compliance for HCBS and home-care agencies. Powered by NECTAR™, the intelligence layer that turns every shift into audit-ready proof.",
      },
      { property: "og:title", content: "HIVE — Run your whole agency from one hive" },
      {
        property: "og:description",
        content:
          "One platform for care, compliance and operations. Powered by NECTAR™.",
      },
    ],
  }),
  component: HiveLandingPage,
});

/* ─────────────────────── Brand mark ─────────────────────── */
function HiveMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border border-[color:var(--border-light)] bg-white text-[color:var(--navy-800)] shadow-sm ${className}`}
    >
      <Hexagon className="h-4 w-4 text-[color:var(--amber-500)]" strokeWidth={2.5} />
    </span>
  );
}

/* Subtle hex outline pattern + amber glow — for dark hero bands only */
function Honeycomb({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <HexBg opacity={0.05} />
    </div>
  );
}

/* ─────────────────────── Page ─────────────────────── */
function HiveLandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ───────── Sticky nav ───────── */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <HiveMark />
            <div className="leading-none">
              <div className="font-display text-lg font-bold tracking-tight">HIVE</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Powered by NECTAR™
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#modules" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Platform
            </a>
            <a href="#nectar" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              NECTAR™
            </a>
            <a href="#compliance" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Compliance
            </a>
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              FAQ
            </a>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-nectar-gold-500 text-hive-navy-800 hover:bg-nectar-gold-600"
            >
              <Link to="/demo">
                Book a demo <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/signup">Get started</Link>
            </Button>
          </div>

          <button
            onClick={() => setMobileOpen((s) => !s)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-border bg-background md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
              {[
                ["#modules", "Platform"],
                ["#nectar", "NECTAR™"],
                ["#compliance", "Compliance"],
                ["#faq", "FAQ"],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-surface-warm"
                >
                  {label}
                </a>
              ))}
              <Link
                to="/pricing"
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-surface-warm"
              >
                Pricing
              </a>
              <div className="mt-2 flex gap-2 pt-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link to="/login">Sign in</a>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="flex-1 bg-nectar-gold-500 text-hive-navy-800 hover:bg-nectar-gold-600"
                >
                  <Link to="/demo">
                    Book a demo
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link to="/signup">Get started</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ───────── Hero ───────── */}
      <header className="relative overflow-hidden bg-gradient-hero text-primary-foreground">
        <Honeycomb className="opacity-100" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-28">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-nectar-gold-300 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Powered by NECTAR™ — the intelligence layer for care
            </div>
            <h1 className="font-display mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Run your whole agency
              <br />
              from <span className="text-nectar-gold-400">one hive</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
              HIVE unifies scheduling, EVV, eMAR, billing and compliance into a single
              workflow. NECTAR™ turns every visit, signature and note into audit-ready proof —
              automatically.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="bg-nectar-gold-500 text-hive-navy-800 hover:bg-nectar-gold-600 shadow-glow"
              >
                <Link to="/demo">
                  Book a demo <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link to="/signup">Get started</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/60">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-nectar-gold-400" /> HIPAA-grade
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-nectar-gold-400" /> EVV-ready (21st Century Cures)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-nectar-gold-400" /> State-specific HCBS coding
              </span>
            </div>
          </div>

          {/* Hero side: stacked hex cards */}
          <div className="relative lg:col-span-5">
            <div className="relative mx-auto grid w-full max-w-md grid-cols-2 gap-4">
              {[
                { icon: CalendarClock, label: "Today's shifts", value: "84 covered" },
                { icon: ShieldCheck, label: "EVV match", value: "99.2%" },
                { icon: Pill, label: "MAR doses", value: "On track" },
                { icon: FileCheck2, label: "Audit ready", value: "100%" },
              ].map(({ icon: Icon, label, value }, i) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur"
                  style={{ transform: i % 2 ? "translateY(20px)" : "translateY(0)" }}
                >
                  <div className="flex items-center gap-2 text-nectar-gold-400">
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
                  </div>
                  <div className="mt-2 font-display text-2xl font-bold">{value}</div>
                </div>
              ))}
            </div>
            <div className="absolute -right-6 -top-6 h-24 w-24 clip-hex bg-nectar-gold-500/30 blur-2xl" />
            <div className="absolute -bottom-8 -left-4 h-32 w-32 clip-hex bg-hive-teal-500/30 blur-2xl" />
          </div>
        </div>
      </header>

      {/* ───────── Compliance trust strip ───────── */}
      <section className="border-y border-border bg-surface-warm">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:px-6 md:flex-row lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Trusted across HCBS, IDD and home-care providers
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-semibold text-muted-foreground">
            <span>HIPAA</span>
            <span className="text-border">•</span>
            <span>21st Century Cures Act</span>
            <span className="text-border">•</span>
            <span>SOC 2-aligned</span>
            <span className="text-border">•</span>
            <span>State HCBS coding</span>
            <span className="text-border">•</span>
            <span>DSPD</span>
          </div>
        </div>
      </section>

      {/* ───────── Modules grid ───────── */}
      <section id="modules" className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-nectar-gold-700">
              The platform
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Finally, every part of care in one hive.
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
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
                className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-nectar-gold-300 hover:shadow-elegant"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                <div className="absolute -right-8 -top-8 h-24 w-24 clip-hex bg-nectar-gold-100 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Competitive contrast ───────── */}
      <CompetitiveContrast />

      {/* ───────── NECTAR spotlight ───────── */}
      <section id="nectar" className="relative overflow-hidden bg-hive-navy-800 text-primary-foreground">
        <Honeycomb />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8 lg:py-24">
          <div className="lg:col-span-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-nectar-gold-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-nectar-gold-300">
              <Sparkles className="h-3.5 w-3.5" /> NECTAR™
            </span>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              The intelligence layer that turns
              <br />
              messy care data into proof.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/75">
              NECTAR™ reads every shift, signature, note and pass — and quietly produces the
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
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-nectar-gold-500 text-hive-navy-800">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="text-white/85">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-6">
            <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-nectar-gold-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                    NECTAR™ · Live feed
                  </span>
                </div>
                <span className="text-[10px] text-white/40">just now</span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  { tag: "EVV", color: "bg-hive-teal-500", text: "House 14 — punch reconciled to auth #4421." },
                  { tag: "MAR", color: "bg-nectar-violet-500", text: "PRN reason captured for K. Rivera — Tylenol 500mg." },
                  { tag: "HHS", color: "bg-nectar-gold-500 text-hive-navy-800", text: "Goal #3 progress updated from today's daily log." },
                  { tag: "AUDIT", color: "bg-white/15", text: "Weekly compliance packet ready for review (12 programs)." },
                ].map((row, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
                  >
                    <span
                      className={`inline-flex h-6 shrink-0 items-center rounded px-1.5 text-[10px] font-bold uppercase tracking-wider ${row.color}`}
                    >
                      {row.tag}
                    </span>
                    <span className="text-white/85">{row.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Compliance ───────── */}
      <section id="compliance" className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-8">
          <div className="lg:col-span-5">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-hive-teal-700">
              Compliance, by default
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Audit-ready isn't a project.
              <br /> It's the platform.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Every action in HIVE is timestamped, signed, and tied to a person, an
              authorization and a service code. When the auditor calls, you don't open a
              spreadsheet — you open HIVE.
            </p>
            <div className="mt-7 flex gap-3">
              <Button
                asChild
                size="lg"
                className="bg-nectar-gold-500 text-hive-navy-800 hover:bg-nectar-gold-600"
              >
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
                <div key={title} className="rounded-xl border border-border bg-card p-5 shadow-card">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-hive-teal-700 text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-display text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Mission band ───────── */}
      <section className="relative overflow-hidden bg-hive-navy-900 text-primary-foreground">
        <Honeycomb />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <HeartHandshake className="mx-auto h-8 w-8 text-nectar-gold-400" />
          <h2 className="font-display mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Care happens at the kitchen table.
            <br />
            Software shouldn't get in the way.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/75">
            HIVE exists so direct support professionals can spend more time with the people
            they support — and less time fighting paperwork. Every feature is measured by one
            question: did this give a caregiver their evening back?
          </p>
        </div>
      </section>

      {/* ───────── Founder story ───────── */}
      <FounderStory />

      {/* ───────── Switching ───────── */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <ArrowRightLeft className="mx-auto h-7 w-7 text-nectar-gold-600" />
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Switching from Therap, Sandata or a stack of spreadsheets?
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              We move your authorizations, clients, staff and historical EVV — in days, not
              quarters. Your team keeps documenting while we mirror the old system in the
              background.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { step: "01", title: "Mirror", body: "We stand up HIVE alongside your current system and reconcile data daily." },
              { step: "02", title: "Migrate", body: "Authorizations, clients, staff, certs and EVV history move with full lineage." },
              { step: "03", title: "Move on", body: "Cutover on your timeline — no missed visits, no missed claims." },
            ].map(({ step, title, body }) => (
              <div key={step} className="rounded-xl border border-border bg-card p-6 shadow-card">
                <div className="font-display text-3xl font-bold text-nectar-gold-600">{step}</div>
                <h3 className="mt-2 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="bg-surface-warm py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-nectar-gold-700">
              FAQ
            </span>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Questions agencies actually ask.
            </h2>
          </div>

          <Accordion type="single" collapsible className="mt-10 divide-y divide-border rounded-xl border border-border bg-card px-6">
            {[
              {
                q: "Which states and waivers does HIVE support today?",
                a: "HIVE ships with HCBS service-code libraries pre-mapped for most state Medicaid waivers, including DSPD (UT), and supports IDD, ABI, aging-and-disability, and behavioral health programs. New states are typically configured in under two weeks.",
              },
              {
                q: "Is HIVE EVV compliant under the 21st Century Cures Act?",
                a: "Yes. HIVE captures all six federally required EVV data points and supports GPS, biometric, and FOB modes. We integrate with state aggregators and reconcile every punch to an active authorization.",
              },
              {
                q: "What is NECTAR™, exactly?",
                a: "NECTAR™ is the intelligence layer inside HIVE. It reads operational signals — EVV punches, MAR entries, goal progress, signatures — and continuously assembles the documentation auditors expect. Your staff don't learn a new tool; the proof just appears.",
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
                <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ───────── Gold final CTA ───────── */}
      <section className="relative overflow-hidden bg-nectar-gold-500">
        <div className="absolute inset-0 opacity-20" aria-hidden>
          <div className="absolute -left-10 top-10 h-40 w-40 clip-hex bg-hive-navy-800" />
          <div className="absolute right-10 top-20 h-24 w-24 clip-hex bg-hive-navy-800" />
          <div className="absolute bottom-0 left-1/3 h-32 w-32 clip-hex bg-hive-navy-800" />
        </div>
        <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight text-hive-navy-800 sm:text-5xl">
            See your agency run from one hive.
          </h2>
          <p className="max-w-2xl text-base text-hive-navy-700">
            A 30-minute demo with someone who has actually billed a Medicaid waiver — not a
            sales script. Bring your hardest workflow.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-hive-navy-800 text-white hover:bg-hive-navy-700"
            >
              <Link to="/demo">
                Book a demo <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-hive-navy-800/30 bg-transparent text-hive-navy-800 hover:bg-hive-navy-800/10 hover:text-hive-navy-800"
            >
              <Link to="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
