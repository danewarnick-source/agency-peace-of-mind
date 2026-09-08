import { createFileRoute, Link } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { PiPricingSection } from "@/components/pi-landing/pi-pricing";
import {
  PI_DIFFERENCE_HEADLINE,
  PI_PRICING_HERO_LEDE,
  PI_PRICING_KICKER,
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
      <main className="wrap pi-pricing-page">
        <p className="sk">{PI_PRICING_KICKER}</p>
        <h1>{PI_DIFFERENCE_HEADLINE}</h1>
        <p className="lede">{PI_PRICING_HERO_LEDE}</p>
        <div className="ctas">
          <Link className="btn p" to="/login">
            {PI_SIGN_IN}
          </Link>
        </div>
        <PiPricingSection heading="" showEnterprise />
      </main>
    </PiPublicPage>
  );
}
