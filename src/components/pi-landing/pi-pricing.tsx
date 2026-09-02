import { Link } from "@tanstack/react-router";
import {
  ANNUAL_DISCOUNT,
  FOUNDING_MINIMUM_CENTS,
  FOUNDING_MONTHS,
  FOUNDING_ORG_CAP,
  FOUNDING_PER_STAFF_CENTS,
  LIST_MINIMUM_CENTS,
  LIST_VOLUME_TIERS,
  PUBLIC_TRAINING_ALA_CARTE,
  PUBLIC_TRAINING_FULL_PROGRAM_INCLUDES,
  TRAINING_PRICE_CENTS,
  formatUsdFromCents,
  publicTrainingBundleSavingsCents,
} from "@/lib/hive-pricing";
import { PI_PRICING_INTRO } from "@/lib/pi-landing";

const NEWSREADER = { fontFamily: '"Newsreader", "Times New Roman", serif' } as const;

function Card({
  children,
  featured = false,
}: {
  children: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <div
      className={`flex h-full flex-col rounded-2xl border p-6 sm:p-8 ${
        featured ? "border-[#f3efe6]/35 bg-white/[0.05]" : "border-white/[0.10] bg-white/[0.03]"
      }`}
    >
      {children}
    </div>
  );
}

export function PiPricingSection({ heading = "Pricing" }: { heading?: string }) {
  const savings = publicTrainingBundleSavingsCents();
  const alaTotal = PUBLIC_TRAINING_ALA_CARTE.reduce((s, r) => s + r.priceCents, 0);

  return (
    <section id="pricing" className="scroll-mt-24 px-5 py-20 sm:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">{heading}</p>
        <h2
          className="mt-3 max-w-3xl text-3xl font-medium leading-[1.12] tracking-[-0.02em] text-[#f3efe6] sm:text-5xl"
          style={NEWSREADER}
        >
          Clear numbers. No second storefront.
        </h2>
        <p className="mt-4 max-w-2xl text-base text-[#f3efe6]/62 sm:text-lg">{PI_PRICING_INTRO}</p>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <Card featured>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#f3efe6]/45">Platform</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              {formatUsdFromCents(LIST_VOLUME_TIERS[0].perStaffCents)}
              <span className="ml-2 text-base font-normal text-[#f3efe6]/55">/ staff / mo</span>
            </p>
            <p className="mt-2 text-sm text-[#f3efe6]/62">
              {formatUsdFromCents(LIST_MINIMUM_CENTS)} / month minimum
            </p>
            <ul className="mt-6 space-y-2 text-sm text-[#f3efe6]/80">
              {LIST_VOLUME_TIERS.map((tier) => (
                <li key={tier.label} className="flex justify-between gap-3">
                  <span>{tier.label}</span>
                  <span className="tabular-nums">
                    {formatUsdFromCents(tier.perStaffCents)} / staff
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3 pt-2">
                <span>Yearly</span>
                <span>{Math.round(ANNUAL_DISCOUNT * 100)}% off</span>
              </li>
            </ul>
          </Card>

          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#f3efe6]/45">
              Founding
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              {formatUsdFromCents(FOUNDING_PER_STAFF_CENTS)}
              <span className="ml-2 text-base font-normal text-[#f3efe6]/55">/ staff / mo</span>
            </p>
            <p className="mt-2 text-sm text-[#f3efe6]/62">
              {formatUsdFromCents(FOUNDING_MINIMUM_CENTS)} / month minimum
            </p>
            <p className="mt-6 text-sm leading-relaxed text-[#f3efe6]/75">
              First {FOUNDING_ORG_CAP} paying agencies. Locked {FOUNDING_MONTHS} months, then list.
              True North Supports stays free and is never charged.
            </p>
          </Card>

          <Card>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#f3efe6]/45">
              Enterprise
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">Contact us</p>
            <p className="mt-2 text-sm text-[#f3efe6]/62">Custom work. No public dollar amount.</p>
            <Link
              to="/contact"
              className="mt-8 inline-flex min-h-11 items-center justify-center rounded-md border border-[#f3efe6]/25 px-4 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
            >
              Contact us
            </Link>
          </Card>
        </div>

        <div className="mt-10 rounded-2xl border border-white/[0.10] bg-white/[0.03] p-6 sm:p-8">
          <h3 className="text-xl font-semibold tracking-tight">Training seats</h3>
          <p className="mt-2 text-sm text-[#f3efe6]/62">
            One-time per staff. Package saves {formatUsdFromCents(savings)} versus all three.
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Package · {formatUsdFromCents(TRAINING_PRICE_CENTS.full_program)}</p>
              <ul className="mt-3 space-y-2 text-sm text-[#f3efe6]/75">
                {PUBLIC_TRAINING_FULL_PROGRAM_INCLUDES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              {PUBLIC_TRAINING_ALA_CARTE.map((row) => (
                <div
                  key={row.sku}
                  className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-3 text-sm"
                >
                  <span>
                    {row.name}
                    {row.sub ? (
                      <span className="mt-0.5 block text-xs text-[#f3efe6]/45">{row.sub}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">{formatUsdFromCents(row.priceCents)}</span>
                </div>
              ))}
              <p className="text-xs text-[#f3efe6]/45">
                All three {formatUsdFromCents(alaTotal)} · package {formatUsdFromCents(TRAINING_PRICE_CENTS.full_program)} ·
                save {formatUsdFromCents(savings)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
