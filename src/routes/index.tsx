import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { CertBenefits } from "@/components/landing/cert-benefits";
import { Testimonials } from "@/components/landing/testimonials";
import { Pricing } from "@/components/landing/pricing";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Care Academy — Employee training & certification platform" },
      { name: "description", content: "Modern training and certification for teams. Assign courses, track progress, and issue verifiable certificates — all in one place." },
      { property: "og:title", content: "Care Academy — Train, certify, stay audit-ready" },
      { property: "og:description", content: "Modern training and certification platform for teams that take compliance seriously." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <CertBenefits />
        <Testimonials />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
