import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PiPublicHeader } from "@/components/pi-landing/pi-public-header";
import { PiPublicFooter } from "@/components/pi-landing/pi-public-footer";
import { PI_LEGAL_NAME } from "@/lib/pi-terms";
import { PI_BAA_AGREE_COPY, PI_BAA_INTRO, PI_BAA_SECTIONS, PI_BAA_TITLE, PI_BAA_VERSION } from "@/lib/pi-baa";

const NEWSREADER =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap";

export const Route = createFileRoute("/baa")({
  head: () => ({
    meta: [
      { title: "Business Associate Agreement — Provider Interface" },
      {
        name: "description",
        content: "Business Associate Agreement for Provider Interface LLC. I agree only — no signature pad.",
      },
      { property: "og:title", content: "Business Associate Agreement — Provider Interface" },
    ],
    links: [{ rel: "stylesheet", href: NEWSREADER }],
  }),
  component: BaaPage,
});

function BaaPage() {
  const [agreed, setAgreed] = useState(false);
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
            {PI_BAA_TITLE}
          </h1>
          <p className="mt-2 text-xs text-[#f3efe6]/45">Version {PI_BAA_VERSION}</p>
          <p className="mt-4 text-base leading-relaxed text-[#f3efe6]/70">{PI_BAA_INTRO}</p>

          {PI_BAA_SECTIONS.map((section) => (
            <section key={section.heading} className="mt-12">
              <h2
                className="text-2xl font-medium tracking-tight"
                style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
              >
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-[#f3efe6]/78">
                {section.paras.map((para) => (
                  <p key={para}>{para}</p>
                ))}
              </div>
            </section>
          ))}

          <label
            className="mt-12 flex items-start gap-3 rounded-xl border border-white/15 bg-white/[0.04] p-4 text-sm text-[#f3efe6]"
            data-testid="baa-agree"
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              data-testid="baa-agree-checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-[#f3efe6]"
            />
            <span data-testid="baa-agree-copy">{PI_BAA_AGREE_COPY}</span>
          </label>
        </article>
      </main>
      <PiPublicFooter />
    </div>
  );
}
