import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/landing/footer";
import { DspdPricing } from "@/components/landing/dspd-pricing";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — HIVE" },
      {
        name: "description",
        content:
          "One plan. Every feature. Volume pricing drops your per-staff rate automatically as your DSPD agency grows. Month-to-month, cancel anytime.",
      },
      { property: "og:title", content: "Pricing — HIVE" },
      {
        property: "og:description",
        content:
          "Simple, transparent pricing for DSPD agencies — scheduling, EVV, eMAR, NECTAR AI, compliance, and HR in one platform.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <DspdPricing />
      </main>
      <Footer />
    </div>
  );
}
