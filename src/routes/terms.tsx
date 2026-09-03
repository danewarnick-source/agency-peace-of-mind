import { createFileRoute } from "@tanstack/react-router";
import { PiPublicHeader } from "@/components/pi-landing/pi-public-header";
import { PiPublicFooter } from "@/components/pi-landing/pi-public-footer";
import {
  PI_LEGAL_NAME,
  PI_TERMS_BILLING_HEADING,
  PI_TERMS_BILLING_PARAS,
  PI_TERMS_CONTRACTS_HEADING,
  PI_TERMS_CONTRACTS_PARAS,
  PI_TERMS_INTRO,
  PI_TERMS_TITLE,
} from "@/lib/pi-terms";

const NEWSREADER =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — Provider Interface" },
      { name: "description", content: "Terms for Provider Interface. Billing, cancellations, and your contracts." },
      { property: "og:title", content: "Terms — Provider Interface" },
    ],
    links: [{ rel: "stylesheet", href: NEWSREADER }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b1220] text-[#f3efe6]">
      <PiPublicHeader />
      <main className="flex-1">
        <article className="mx-auto max-w-2xl px-5 pb-20 pt-14 sm:px-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">
            {PI_LEGAL_NAME}
          </p>
          <h1
            className="mt-3 text-4xl font-medium tracking-[-0.02em] sm:text-5xl"
            style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
          >
            {PI_TERMS_TITLE}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#f3efe6]/70">{PI_TERMS_INTRO}</p>

          <section className="mt-12" data-testid="terms-billing">
            <h2
              className="text-2xl font-medium tracking-tight"
              style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
            >
              {PI_TERMS_BILLING_HEADING}
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-[#f3efe6]/78">
              {PI_TERMS_BILLING_PARAS.map((para) => (
                <p key={para}>{para}</p>
              ))}
            </div>
          </section>

          <section className="mt-12" data-testid="terms-contracts">
            <h2
              className="text-2xl font-medium tracking-tight"
              style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
            >
              {PI_TERMS_CONTRACTS_HEADING}
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-[#f3efe6]/78">
              {PI_TERMS_CONTRACTS_PARAS.map((para) => (
                <p key={para}>{para}</p>
              ))}
            </div>
          </section>
        </article>
      </main>
      <PiPublicFooter />
    </div>
  );
}
