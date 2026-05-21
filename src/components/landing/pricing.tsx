import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Starter",
    price: "$99",
    desc: "For small agencies just getting started.",
    features: ["Up to 15 staff", "Core training library", "Email reminders", "Basic reports"],
    cta: "Start free trial",
    featured: false,
  },
  {
    name: "Growth",
    price: "$249",
    desc: "For growing agencies with active caseloads.",
    features: ["Up to 75 staff", "Full DSPD library", "Automated renewals", "Audit-ready exports", "Priority support"],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    desc: "Multi-site agencies & state partners.",
    features: ["Unlimited staff", "Custom modules", "SSO + SAML", "Dedicated success manager"],
    cta: "Talk to sales",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="bg-secondary/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Pricing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-muted-foreground">Per month, billed annually. No setup fees.</p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-8 ${
                t.featured
                  ? "border-accent bg-card shadow-[var(--shadow-elegant)] md:scale-105"
                  : "border-border bg-card shadow-[var(--shadow-card)]"
              }`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold tracking-tight">{t.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight">{t.price}</span>
                {t.price !== "Custom" && <span className="text-sm text-muted-foreground">/mo</span>}
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-accent" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={`mt-8 w-full ${t.featured ? "bg-[image:var(--gradient-brand)] text-primary-foreground" : ""}`}
                variant={t.featured ? "default" : "outline"}
              >
                <Link to="/signup">{t.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
