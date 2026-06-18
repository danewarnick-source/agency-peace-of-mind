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
    cta: "Get started",
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
    <section id="pricing" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--amber-600)]">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[color:var(--navy-900)] md:text-4xl">
            Simple, per-seat pricing
          </h2>
          <p className="mt-4 text-[color:var(--text-soft)]">
            Only pay for the employees you're actively training. Cancel anytime.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-6 md:grid-cols-2">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl bg-white p-8 transition ${
                t.featured
                  ? "border-2 border-[color:var(--amber-500)] shadow-[0_24px_60px_-30px_rgba(244,169,58,0.5)]"
                  : "border border-[color:var(--border-light)] shadow-[var(--shadow-card)]"
              }`}
            >
              {t.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[image:var(--gradient-amber)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--navy-900)] shadow-sm">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold tracking-tight text-[color:var(--navy-900)]">{t.name}</h3>
              <p className="mt-2 text-sm text-[color:var(--text-soft)]">{t.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold tracking-tight text-[color:var(--navy-900)]">{t.price}</span>
                {t.price !== "Custom" && (
                  <span className="text-sm text-[color:var(--text-soft)]">/ employee / mo</span>
                )}
              </div>
              <ul className="mt-6 space-y-3 text-sm text-[color:var(--navy-900)]">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-[color:var(--amber-600)]" /> {f}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-8 w-full" variant={t.featured ? "default" : "secondary"} size="lg">
                <Link to={t.name === "Enterprise" ? "/contact" : "/signup"}>{t.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
