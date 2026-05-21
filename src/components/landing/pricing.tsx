import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const tiers = [
  {
    name: "Per active employee",
    price: "$25",
    desc: "Simple per-seat pricing. Add or remove employees anytime — billing adjusts automatically.",
    features: [
      "Unlimited course assignments",
      "Full certification tracking",
      "Manager dashboards & reports",
      "Email invites & onboarding",
      "Verifiable certificate links",
      "Priority email support",
    ],
    cta: "Start free trial",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    desc: "For multi-site organizations with SSO, custom training, and dedicated success management.",
    features: ["SSO / SAML", "Custom course authoring", "Dedicated CSM", "Custom integrations", "Volume pricing"],
    cta: "Talk to sales",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Pricing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Simple, per-seat pricing</h2>
          <p className="mt-4 text-muted-foreground">Only pay for the employees you're actively training. Cancel anytime.</p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-6 md:grid-cols-2">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-8 ${
                t.featured ? "border-accent bg-card shadow-[var(--shadow-elegant)]" : "border-border bg-card shadow-[var(--shadow-card)]"
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
                {t.price !== "Custom" && <span className="text-sm text-muted-foreground">/ employee / mo</span>}
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-accent" /> {f}</li>
                ))}
              </ul>
              <Button asChild className={`mt-8 w-full ${t.featured ? "bg-[image:var(--gradient-brand)] text-primary-foreground" : ""}`} variant={t.featured ? "default" : "outline"}>
                <Link to={t.name === "Enterprise" ? "/contact" : "/signup"}>{t.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
