import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { Contact } from "@/components/landing/contact";
import { Footer } from "@/components/landing/footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareCompliance — DSPD compliance, training & audit-ready reports" },
      { name: "description", content: "Run your disability services agency with peace of mind. Structured training, automated certification tracking, and instant audit-ready reporting." },
      { property: "og:title", content: "CareCompliance — Peace-of-mind DSPD compliance" },
      { property: "og:description", content: "Structured training, automated certification tracking, and instant audit-ready reporting for disability services agencies." },
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
        <Pricing />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
