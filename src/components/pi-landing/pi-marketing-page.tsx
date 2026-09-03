import { Link } from "@tanstack/react-router";
import { PiPublicHeader } from "@/components/pi-landing/pi-public-header";
import { PiPublicFooter } from "@/components/pi-landing/pi-public-footer";
import { PiPricingSection } from "@/components/pi-landing/pi-pricing";
import { DuskDeskStill } from "@/components/pi-landing/dusk-desk-still";
import {
  PI_DIFFERENCE_BODY,
  PI_DIFFERENCE_HEADLINE,
  PI_HEADLINE,
  PI_PROBLEM_BODY,
  PI_PROBLEM_HEADLINE,
  PI_PROBLEM_KICKER,
  PI_SIGN_IN,
  PI_SUBHEAD,
  PI_TALK_TO_US,
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
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#f3efe6] px-6 text-sm font-medium text-[#0b1220] hover:bg-[#f3efe6]/90"
              >
                {PI_SIGN_IN}
              </Link>
              <Link
                to="/contact"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#f3efe6]/25 px-6 text-sm font-medium text-[#f3efe6] hover:bg-white/[0.06]"
              >
                {PI_TALK_TO_US}
              </Link>
            </div>
          </section>

          <div className="pb-4">
            <DuskDeskStill />
          </div>

          <section id="why" className="scroll-mt-24 px-5 py-16 sm:px-8 md:py-20">
            <div className="mx-auto max-w-3xl">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#f3efe6]/45">
                {PI_PROBLEM_KICKER}
              </p>
              <h2
                className="mt-3 text-3xl font-medium leading-[1.12] tracking-[-0.02em] sm:text-5xl"
                style={NEWSREADER}
              >
                {PI_PROBLEM_HEADLINE}
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#f3efe6]/62 sm:text-lg">
                {PI_PROBLEM_BODY}
              </p>
              <h3
                className="mt-12 text-2xl font-medium leading-[1.15] tracking-[-0.02em] sm:text-4xl"
                style={NEWSREADER}
              >
                {PI_DIFFERENCE_HEADLINE}
              </h3>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#f3efe6]/62 sm:text-lg">
                {PI_DIFFERENCE_BODY}
              </p>
            </div>
          </section>

          <PiPricingSection heading="The number" compact />
        </main>

        <PiPublicFooter />
      </div>
    </div>
  );
}
