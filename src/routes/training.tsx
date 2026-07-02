import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "HIVE Training — DSPD staff training + certifications" },
      {
        name: "description",
        content:
          "CPR & First Aid, Mandt behavioral intervention, and 30-day DSPD required training for direct-support staff. Buy seats for your team or pay per course.",
      },
      { property: "og:title", content: "HIVE Training — DSPD staff training + certifications" },
      {
        property: "og:description",
        content:
          "One-time $300 full program or à la carte courses. CPR/First Aid, Mandt, DSPD required + 12 hrs ongoing content per year.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrainingStorefront,
});

type CatalogRow = {
  id: string;
  sku: string;
  name: string;
  kind: "full_program" | "ala_carte";
  price_cents: number;
  includes: string[];
  sort: number;
};

function TrainingStorefront() {
  const { data: catalog = [] } = useQuery({
    queryKey: ["hive-training-catalog"],
    queryFn: async (): Promise<CatalogRow[]> => {
      const { data, error } = await supabase
        .from("hive_training_catalog")
        .select("id, sku, name, kind, price_cents, includes, sort")
        .eq("active", true)
        .order("sort");
      if (error) throw error;
      return (data ?? []) as CatalogRow[];
    },
  });

  const full = catalog.find((c) => c.sku === "full_program");
  const alacarte = catalog.filter((c) => c.kind === "ala_carte");
  const aCarteTotal = alacarte.reduce((s, c) => s + c.price_cents, 0);
  const fullCents = full?.price_cents ?? 30000;
  const savings = Math.max(0, aCarteTotal - fullCents);

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--training-bg)" }}>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-16 sm:px-6 md:pt-24 lg:px-8">
          <div className="text-center">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: "var(--training-gold)" }}
            >
              Staff Training
            </p>
            <h1
              className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
              style={{ color: "var(--training-navy)" }}
            >
              Certifications your team actually finishes.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-[color:var(--text-soft)] sm:text-lg">
              CPR, Mandt, and DSPD-required training, delivered on the phone your DSPs already use.
              Buy seats for your whole team, or let staff pay for a single course.
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 sm:px-6 md:grid-cols-2 md:gap-8 lg:px-8">
          {/* FULL PROGRAM */}
          <PricingCard featured navy>
            <Eyebrow gold>Full program · save {savings > 0 ? `$${(savings / 100).toFixed(0)}` : ""}</Eyebrow>
            <CardTitle>Full training program</CardTitle>
            <Price cents={fullCents} suffix="/ staff · one-time" />
            <ul className="mt-6 space-y-3">
              {(full?.includes ?? [
                "CPR & First Aid",
                "Mandt behavioral intervention",
                "30-day DSPD required training",
                "Hands-on HIVE platform walkthrough",
                "Competency verification & sign-off",
                "12 hours custom ongoing training / year",
              ]).map((line) => (
                <li key={line} className="flex items-start gap-3 text-sm">
                  <span
                    className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full"
                    style={{ background: "var(--training-gold)", color: "white" }}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span style={{ color: "var(--training-navy)" }}>{line}</span>
                </li>
              ))}
            </ul>
            <CTA />
          </PricingCard>

          {/* À LA CARTE */}
          <PricingCard>
            <Eyebrow>À la carte — only what you need</Eyebrow>
            <CardTitle>Individual courses</CardTitle>
            <div className="mt-6 divide-y divide-[color:var(--border-light)]">
              {alacarte.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--training-navy)" }}>
                      {c.name}
                    </p>
                    {c.includes?.[0] && (
                      <p className="mt-0.5 text-xs text-[color:var(--text-soft)]">{c.includes[0]}</p>
                    )}
                  </div>
                  <p className="text-lg font-bold" style={{ color: "var(--training-navy)" }}>
                    ${(c.price_cents / 100).toFixed(0)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-6 rounded-lg bg-[color:var(--surface-2)] px-4 py-3 text-xs text-[color:var(--text-soft)]">
              All three à la carte: <strong>${(aCarteTotal / 100).toFixed(0)}</strong> · Full program:{" "}
              <strong>${(fullCents / 100).toFixed(0)}</strong>
              {savings > 0 && <> — save <strong>${(savings / 100).toFixed(0)}</strong>.</>}
            </p>
            <CTA variant="outline" />
          </PricingCard>
        </section>

        <section className="border-t border-[color:var(--border-light)] bg-white/60 py-14">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <GraduationCap
              className="mx-auto mb-4 h-8 w-8"
              style={{ color: "var(--training-gold)" }}
            />
            <h2 className="font-display text-2xl font-bold" style={{ color: "var(--training-navy)" }}>
              Already using HIVE?
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[color:var(--text-soft)]">
              Training assignments made in your HIVE dashboard and via this storefront are the same
              records. Log in and open the Training tab.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button asChild variant="outline">
                <Link to="/login">Log in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Eyebrow({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <p
      className="text-[10px] font-semibold uppercase tracking-[0.24em]"
      style={{ color: gold ? "var(--training-gold)" : "var(--training-navy)" }}
    >
      {children}
    </p>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mt-3 font-display text-2xl font-bold tracking-tight"
      style={{ color: "var(--training-navy)" }}
    >
      {children}
    </h3>
  );
}

function Price({ cents, suffix }: { cents: number; suffix: string }) {
  return (
    <p className="mt-4 flex items-baseline gap-2">
      <span className="text-4xl font-bold" style={{ color: "var(--training-navy)" }}>
        ${(cents / 100).toFixed(0)}
      </span>
      <span className="text-sm text-[color:var(--text-soft)]">{suffix}</span>
    </p>
  );
}

function PricingCard({
  children,
  featured,
  navy,
}: {
  children: React.ReactNode;
  featured?: boolean;
  navy?: boolean;
}) {
  void navy;
  return (
    <div
      className="relative rounded-3xl bg-white p-8 sm:p-10"
      style={{
        boxShadow: featured
          ? "var(--training-glow)"
          : "0 4px 24px -8px rgba(13,17,43,0.08), 0 1px 3px rgba(13,17,43,0.04)",
        border: featured
          ? "1px solid rgba(200,136,30,0.35)"
          : "1px solid var(--border-light)",
      }}
    >
      {children}
    </div>
  );
}

function CTA({ variant = "primary" }: { variant?: "primary" | "outline" }) {
  const base =
    "mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition";
  const primary = "text-white shadow-lg hover:brightness-110";
  const outline = "border border-[color:var(--training-navy)]/20 hover:bg-[color:var(--surface-2)]";
  return (
    <Link
      to="/signup"
      search={{ flow: "training" } as unknown as never}
      className={`${base} ${variant === "primary" ? primary : outline}`}
      style={
        variant === "primary"
          ? { background: "var(--training-gold)" }
          : { color: "var(--training-navy)" }
      }
    >
      Sign up <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
