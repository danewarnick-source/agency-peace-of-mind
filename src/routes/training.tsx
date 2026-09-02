import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import {
  PUBLIC_TRAINING_ALA_CARTE,
  TRAINING_PRICE_CENTS,
  formatUsdFromCents,
  publicTrainingBundleSavingsCents,
} from "@/lib/hive-pricing";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Training — Provider Interface" },
      {
        name: "description",
        content:
          "Staff complete assigned training inside Provider Interface on My Obligations. Agencies do not sell seats to staff. True North Supports stays $0.",
      },
      { property: "og:title", content: "Training — Provider Interface" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TrainingExplainer,
});

function TrainingExplainer() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b1220] text-[#f3efe6]">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-4 pb-16 pt-16 sm:px-6 md:pt-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#f3efe6]/45">
            Training
          </p>
          <h1
            className="mt-3 text-3xl font-medium tracking-tight text-[#f3efe6]"
            style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
          >
            Staff training lives in the office
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#f3efe6]/62">
            Staff never buy seats. An admin submits a class roster for CPR, Mandt, or the training
            package. Assigned work shows up on My Obligations. True North Supports is always $0.
          </p>
          <ul className="mt-6 space-y-2 rounded-xl border border-white/[0.10] bg-white/[0.03] p-4 text-sm">
            {PUBLIC_TRAINING_ALA_CARTE.map((row) => (
              <li key={row.sku} className="flex items-baseline justify-between gap-3">
                <span>{row.name}</span>
                <span className="font-semibold">{formatUsdFromCents(row.priceCents)} / seat</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 border-t border-white/[0.08] pt-2">
              <span>Training package</span>
              <span className="font-semibold">
                {formatUsdFromCents(TRAINING_PRICE_CENTS.full_program)} / seat
              </span>
            </li>
            <li className="text-xs text-[#f3efe6]/45">
              Package saves {formatUsdFromCents(publicTrainingBundleSavingsCents())}. True North is
              never charged.
            </li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="bg-[#f3efe6] text-[#0b1220] hover:bg-[#f3efe6]/90">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-[#f3efe6]/25 bg-transparent text-[#f3efe6] hover:bg-white/[0.06] hover:text-[#f3efe6]"
            >
              <Link to="/contact">Contact us</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
