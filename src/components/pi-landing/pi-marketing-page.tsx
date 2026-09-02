import { Link } from "@tanstack/react-router";
import { PiPublicHeader } from "@/components/pi-landing/pi-public-header";
import { PiPublicFooter } from "@/components/pi-landing/pi-public-footer";
import { PiProductShots } from "@/components/pi-landing/pi-product-shots";
import { PiPricingSection } from "@/components/pi-landing/pi-pricing";
import { DuskDeskStill } from "@/components/pi-landing/dusk-desk-still";
import {
  PI_CTA_BODY,
  PI_CTA_HEADLINE,
  PI_HEADLINE,
  PI_HERO_SUPPORT,
  PI_SUBHEAD,
  PI_WHAT_YOU_GET,
} from "@/lib/pi-landing";

const NEWSREADER = { fontFamily: '"Newsreader", "Times New Roman", serif' } as const;

export function PiMarketingPage() {
  return (
    <div className="relative min-h-screen bg-[#0b1220] text-[#f3efe6]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
        aria-hidden
      />

      <div className="relative z-10">
        <PiPublicHeader />

        <main>
          <section className="px-5 pb-8 pt-10 sm:px-8 sm:pt-14 md:pt-16">
            <h1
              className="mx-auto max-w-4xl text-center text-[2.35rem] font-medium leading-[1.08] tracking-[-0.02em] text-[#f3efe6] sm:text-6xl md:text-[4.15rem]"
              style={NEWSREADER}
            >
              {PI_HEADLINE}
            </h1>
            <p
              className="mt-3 text-center text-lg font-normal text-[#f3efe6]/68 sm:mt-4 sm:text-xl"
              style={NEWSREADER}
            >
              {PI_SUBHEAD}
            </p>
            <p className="mx-auto mt-6 max-w-2xl text-center text-base leading-relaxed text-[#f3efe6]/62 sm:text-lg">
              {PI_HERO_SUPPORT}
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#f3efe6] px-6 text-sm font-medium text-[#0b1220] hover:bg-[#f3efe6]/90"
              >
                Sign in
              </Link>
            </div>
          </section>

          <div className="pb-4">
            <DuskDeskStill />
          </div>

          <section id="what-you-get" className="scroll-mt-24 px-5 py-20 sm:px-8 md:py-28">
            <div className="mx-auto max-w-6xl">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">
                What you get
              </p>
              <h2
                className="mt-3 max-w-3xl text-3xl font-medium leading-[1.12] tracking-[-0.02em] sm:text-5xl"
                style={NEWSREADER}
              >
                Peace of mind. Ease. One quiet office.
              </h2>
              <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {PI_WHAT_YOU_GET.map((item) => (
                  <article key={item.title} className="border-t border-white/[0.08] pt-5">
                    <h3 className="font-sans text-lg font-semibold tracking-tight">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#f3efe6]/62">{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <PiProductShots />
          <PiPricingSection />

          <section className="px-5 py-20 sm:px-8 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <h2
                className="text-3xl font-medium leading-[1.12] tracking-[-0.02em] sm:text-5xl"
                style={NEWSREADER}
              >
                {PI_CTA_HEADLINE}
              </h2>
              <p className="mt-4 text-base text-[#f3efe6]/62 sm:text-lg">{PI_CTA_BODY}</p>
              <Link
                to="/login"
                className="mt-8 inline-flex min-h-11 items-center justify-center rounded-md bg-[#f3efe6] px-6 text-sm font-medium text-[#0b1220] hover:bg-[#f3efe6]/90"
              >
                Sign in
              </Link>
            </div>
          </section>
        </main>

        <PiPublicFooter />
      </div>
    </div>
  );
}
