import { createFileRoute, Link } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { PiPricingSection } from "@/components/pi-landing/pi-pricing";
import {
  PI_PRICING_PAGE_DESCRIPTION,
  PI_PRICING_PAGE_TITLE,
  PI_SIGN_IN,
} from "@/lib/pi-landing";

const NEWSREADER =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: PI_PRICING_PAGE_TITLE },
      { name: "description", content: PI_PRICING_PAGE_DESCRIPTION },
      { property: "og:title", content: PI_PRICING_PAGE_TITLE },
      { property: "og:description", content: PI_PRICING_PAGE_DESCRIPTION },
    ],
    links: [{ rel: "stylesheet", href: NEWSREADER }],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <PiPublicPage>
      <main>
        <div className="wrap page" style={{ paddingBottom: 12, textAlign: "center" }}>
          <p className="sk" style={{ justifyContent: "center" }}>
            Pricing
          </p>
          <h1 style={{ marginLeft: "auto", marginRight: "auto" }}>One number. The whole office.</h1>
          <p className="lede">The list price is the price. Sign in when you are ready.</p>
          <Link className="btn p sm" to="/login" style={{ marginTop: 24 }}>
            {PI_SIGN_IN}
          </Link>
        </div>
        <PiPricingSection heading="" showEnterprise />
      </main>
    </PiPublicPage>
  );
}
