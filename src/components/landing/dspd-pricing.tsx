import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, HeartPulse, ShieldCheck, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const BASE_RATE = 125;
const MIN_MONTHLY = 500;
const ANNUAL_DISCOUNT = 0.2;

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const TIERS = [
  { rate: 125, label: "1–19 clients" },
  { rate: 109, label: "20–49 clients" },
  { rate: 99, label: "50+ clients" },
];

const HIVE_FEATURES = [
  "Scheduling & shift management",
  "Electronic Visit Verification (EVV)",
  "eMAR — medication support",
  "Daily logs & documentation",
  "NECTAR AI assistant",
  "Incident & critical event management",
  "Audit-ready compliance reports",
  "HR & credential tracking with expiry alerts",
  "DHHS EVV CSV export",
  "Priority support",
];

const ENTERPRISE_FEATURES = [
  "Everything in the standard plan",
  "Custom features built for your agency",
  "Full system integration (EHR, payroll, state)",
  "Dedicated onboarding & implementation",
  "White-glove data migration",
  "Dedicated account manager",
  "SLA guarantee",
  "Direct product roadmap input",
];

const FULL_PROGRAM = [
  "CPR & First Aid",
  "Mandt behavioral intervention",
  "30-day DSPD required training",
  "Hands-on Hive platform walkthrough",
  "Competency verification & sign-off",
  "12 hrs custom ongoing training content / year",
];

const ALA_CARTE = [
  { name: "CPR / First Aid", price: 75, icon: HeartPulse },
  { name: "Mandt", price: 200, icon: ShieldCheck },
  {
    name: "DSPD required training",
    price: 100,
    icon: GraduationCap,
    sub: "Includes 12 hrs ongoing content / year",
  },
];

const FAQ = [
  {
    q: "How does volume pricing work?",
    a: "Your rate is based on your active client count and adjusts automatically each billing cycle. As your agency grows past 20 or 50 clients, the per-staff rate drops on its own — no plan changes needed.",
  },
  {
    q: "What counts toward the $500 minimum?",
    a: "The platform subscription only. Training fees are one-time and separate from the minimum. If your staff count × rate comes to less than $500, you pay $500 flat.",
  },
  {
    q: "What is the 12 hours of ongoing training content?",
    a: "Custom training material built specifically for your agency — your policies, your workflows, your clients' needs. Not generic content. Delivered annually and accessible through the Hive platform.",
  },
  {
    q: "Is the training required?",
    a: "No. But agencies that complete the full program see significantly fewer compliance errors in the first 90 days. You can add it for all staff, select staff, or individual modules only.",
  },
  {
    q: "Is there a contract?",
    a: "No — month to month, cancel any time. Annual plans are paid upfront for the 20% discount.",
  },
];

export function DspdPricing() {
  const [annual, setAnnual] = useState(false);
  const [staff, setStaff] = useState(20);

  const applyCycle = (monthly: number) =>
    annual ? monthly * (1 - ANNUAL_DISCOUNT) : monthly;

  const hiveRate = applyCycle(BASE_RATE);

  const monthlyEstimate = Math.max(staff * BASE_RATE, MIN_MONTHLY);
  const annualEstimate = monthlyEstimate * 12 * (1 - ANNUAL_DISCOUNT);
  const annualSavings = monthlyEstimate * 12 - annualEstimate;

  const faqJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    }),
    [],
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* HERO */}
      <section className="bg-[image:var(--gradient-navy)] text-white">
        <div className="mx-auto max-w-5xl px-6 pt-20 pb-14 text-center md:pt-28 md:pb-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--amber-500)]">
            Pricing
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-5 text-lg text-white/70 md:text-xl">
            One plan. Every feature. Price drops as your agency grows.
          </p>

          {/* Billing toggle */}
          <div className="mt-10 inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`min-h-11 rounded-full px-5 text-sm font-medium transition ${
                !annual
                  ? "bg-white text-[color:var(--navy-900)] shadow"
                  : "text-white/70 hover:text-white"
              }`}
              aria-pressed={!annual}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`min-h-11 inline-flex items-center gap-2 rounded-full px-5 text-sm font-medium transition ${
                annual
                  ? "bg-white text-[color:var(--navy-900)] shadow"
                  : "text-white/70 hover:text-white"
              }`}
              aria-pressed={annual}
            >
              Annual
              <span className="rounded-full bg-[image:var(--gradient-amber)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--navy-900)]">
                Save 20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* PLAN CARDS */}
      <section className="bg-background">
        <div className="mx-auto -mt-10 max-w-5xl px-6 pb-16">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Hive standard */}
            <div className="relative flex flex-col rounded-2xl border-2 border-[color:var(--amber-500)] bg-card p-8 shadow-[0_24px_60px_-30px_rgba(244,169,58,0.5)]">
              <span className="absolute -top-3 left-6 rounded-full bg-[image:var(--gradient-amber)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--navy-900)]">
                Standard plan
              </span>
              <h2 className="text-2xl font-semibold">Hive</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The full platform — scheduling, EVV, eMAR, NECTAR AI, compliance, and HR — for every agency.
              </p>
              <div className="mt-6">
                <span className="text-5xl font-semibold tracking-tight">
                  {fmt.format(hiveRate)}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">
                  per staff / month
                  <span className="ml-1 text-[color:var(--amber-600)]">· 1–19 clients</span>
                </span>
              </div>
              <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                $500/month minimum · price drops automatically as your agency grows
                {annual ? " · paid annually" : ""}
              </p>

              <ul className="mt-6 space-y-3 text-sm">
                {HIVE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--amber-600)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className="mt-8 min-h-11 w-full bg-[image:var(--gradient-amber)] text-[color:var(--navy-900)] hover:opacity-90"
              >
                <Link to="/signup">Get started</Link>
              </Button>
            </div>

            {/* Enterprise */}
            <div className="relative flex flex-col rounded-2xl border border-border bg-card p-8">
              <h2 className="text-2xl font-semibold">Enterprise</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Custom-built features, deep integrations, and white-glove onboarding for larger or more complex agencies.
              </p>
              <div className="mt-6">
                <span className="text-4xl font-semibold tracking-tight">Custom pricing</span>
                <p className="mt-1 text-sm text-muted-foreground">Contact us for a quote</p>
              </div>
              <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                For agencies needing tailored workflows, integrations, or enterprise SLAs
              </p>

              <ul className="mt-6 space-y-3 text-sm">
                {ENTERPRISE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--amber-600)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button asChild variant="outline" className="mt-8 min-h-11 w-full">
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          </div>

          {/* Volume pricing callout */}
          <div className="mt-12 rounded-2xl border border-border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
              <h3 className="text-lg font-semibold">
                Volume pricing — your rate drops automatically as your agency grows
              </h3>
              <p className="text-sm text-muted-foreground">
                Based on active clients. Adjusts each billing cycle — no action needed.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {TIERS.map((t, i) => (
                <div
                  key={t.label}
                  className={`rounded-xl border p-4 ${
                    i === 0
                      ? "border-[color:var(--amber-500)]/60 bg-[color:var(--amber-500)]/5"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="text-3xl font-semibold tracking-tight text-[color:var(--amber-600)]">
                    {fmt.format(applyCycle(t.rate))}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    per staff / month · {t.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cost estimator */}
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 md:p-8">
            <h3 className="text-lg font-semibold">Estimate your monthly cost</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Based on the starting $125 / staff rate{annual ? " with the 20% annual discount" : ""}.
            </p>

            <div className="mt-6">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="staff-slider" className="font-medium">
                  How many active staff do you have?
                </label>
                <span className="text-xl font-semibold tabular-nums">{staff}</span>
              </div>
              <Slider
                id="staff-slider"
                value={[staff]}
                onValueChange={(v) => setStaff(v[0] ?? 1)}
                min={1}
                max={300}
                step={1}
                className="mt-4"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>300</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className={`rounded-xl border p-5 ${!annual ? "border-[color:var(--amber-500)]" : "border-border"}`}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Monthly bill
                </div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {fmt.format(monthlyEstimate)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span>
                </div>
                {monthlyEstimate === MIN_MONTHLY && (
                  <div className="mt-1 text-xs text-muted-foreground">$500/month minimum applied</div>
                )}
              </div>
              <div className={`rounded-xl border p-5 ${annual ? "border-[color:var(--amber-500)]" : "border-border"}`}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Annual bill — 20% off
                </div>
                <div className="mt-1 text-3xl font-semibold tracking-tight">
                  {fmt.format(annualEstimate)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">/ year</span>
                </div>
                <div className="mt-1 text-xs text-[color:var(--amber-600)]">
                  Saves {fmt.format(annualSavings)} / year
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STAFF TRAINING */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--amber-600)]">
            Staff training
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Trained, certified, ready to clock in
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Full program */}
            <div className="rounded-2xl border-2 border-[color:var(--amber-500)] bg-card p-8 shadow-[0_24px_60px_-30px_rgba(244,169,58,0.4)]">
              <h3 className="text-xl font-semibold">Full training program</h3>
              <div className="mt-3">
                <span className="text-4xl font-semibold tracking-tight">$300</span>
                <span className="ml-2 text-sm text-muted-foreground">/ staff member · one-time</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Every staff member fully trained on DSPD compliance and the Hive platform before their first shift. Best value — all three modules plus custom content included.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {FULL_PROGRAM.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--amber-600)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* À la carte */}
            <div className="rounded-2xl border border-border bg-card p-8">
              <h3 className="text-xl font-semibold">À la carte — only what you need</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Add individual certifications for staff who already have some training.
              </p>
              <div className="mt-6 space-y-3">
                {ALA_CARTE.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.name}
                      className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-4"
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="mt-0.5 h-5 w-5 text-[color:var(--amber-600)]" />
                        <div>
                          <div className="font-medium">{item.name}</div>
                          {item.sub && (
                            <div className="text-xs text-muted-foreground">{item.sub}</div>
                          )}
                        </div>
                      </div>
                      <div className="whitespace-nowrap text-sm font-semibold">
                        ${item.price} <span className="font-normal text-muted-foreground">/ person</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                All three à la carte: <span className="font-semibold">$375</span> · Full program: <span className="font-semibold">$300</span> — save $75
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-background py-16">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--amber-600)]">
            Common questions
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Answers, in plain language
          </h2>

          <Accordion type="single" collapsible className="mt-8">
            {FAQ.map((item, i) => (
              <AccordionItem key={item.q} value={`item-${i}`}>
                <AccordionTrigger className="min-h-11 text-left text-base font-medium">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA STRIP */}
      <section className="bg-[image:var(--gradient-navy)] text-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-16 text-center md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Ready to run your whole agency from one hive?
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              className="min-h-11 bg-[image:var(--gradient-amber)] px-6 text-[color:var(--navy-900)] hover:opacity-90"
            >
              <Link to="/contact">Book a demo</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="min-h-11 border-white/30 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"
            >
              <Link to="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
