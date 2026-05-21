import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Pricing } from "@/components/landing/pricing";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Care Academy" },
      { name: "description", content: "Simple per-employee pricing. $25 per active employee per month. No setup fees, cancel anytime." },
      { property: "og:title", content: "Pricing — Care Academy" },
      { property: "og:description", content: "Per-seat training and certification platform pricing." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pt-12">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Pay only for the people you're training</h1>
          <p className="mt-4 text-muted-foreground">Add or remove employees anytime. Your subscription updates automatically.</p>
        </div>
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
