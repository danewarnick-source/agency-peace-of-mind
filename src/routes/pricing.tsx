import { createFileRoute, Link } from "@tanstack/react-router";
import { PiPublicHeader } from "@/components/pi-landing/pi-public-header";
import { PiPublicFooter } from "@/components/pi-landing/pi-public-footer";
import { PiPricingSection } from "@/components/pi-landing/pi-pricing";

const NEWSREADER =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Provider Interface" },
      {
        name: "description",
        content:
          "Provider Interface pricing: $125/staff, $500/mo minimum, volume rates, founding for the first five paying agencies, and training seats.",
      },
      { property: "og:title", content: "Pricing — Provider Interface" },
      {
        property: "og:description",
        content:
          "Clear platform and training prices. True North Supports stays free.",
      },
    ],
    links: [{ rel: "stylesheet", href: NEWSREADER }],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b1220] text-[#f3efe6]">
      <PiPublicHeader />
      <main className="flex-1">
        <div className="px-5 pt-12 text-center sm:px-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">
            Pricing
          </p>
          <h1
            className="mt-3 text-4xl font-medium tracking-[-0.02em] sm:text-6xl"
            style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
          >
            The numbers, in one place
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#f3efe6]/62">
            Same prices as the homepage. Sign in when you are ready.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-[#f3efe6] px-6 text-sm font-medium text-[#0b1220] hover:bg-[#f3efe6]/90"
          >
            Sign in
          </Link>
        </div>
        <PiPricingSection heading="" />
      </main>
      <PiPublicFooter />
    </div>
  );
}
