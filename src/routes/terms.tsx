import { createFileRoute } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import {
  PI_LEGAL_NAME,
  PI_TERMS_BILLING_HEADING,
  PI_TERMS_BILLING_PARAS,
  PI_TERMS_CONTRACTS_HEADING,
  PI_TERMS_CONTRACTS_PARAS,
  PI_TERMS_INTRO,
  PI_TERMS_TITLE,
} from "@/lib/pi-terms";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — Provider Interface" },
      { name: "description", content: "Terms for Provider Interface. Billing, cancellations, and your contracts." },
      { property: "og:title", content: "Terms — Provider Interface" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PiPublicPage>
      <main className="wrap pi-home-article">
        <p className="pi-home-kicker">{PI_LEGAL_NAME}</p>
        <h1>{PI_TERMS_TITLE}</h1>
        <p className="pi-home-lede">{PI_TERMS_INTRO}</p>

        <section className="mt-12" data-testid="terms-billing">
          <h2>{PI_TERMS_BILLING_HEADING}</h2>
          <div className="page-copy">
            {PI_TERMS_BILLING_PARAS.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>
        </section>

        <section className="mt-12" data-testid="terms-contracts">
          <h2>{PI_TERMS_CONTRACTS_HEADING}</h2>
          <div className="page-copy">
            {PI_TERMS_CONTRACTS_PARAS.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>
        </section>
      </main>
    </PiPublicPage>
  );
}
