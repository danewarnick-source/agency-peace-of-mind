import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { PI_LEGAL_NAME } from "@/lib/pi-terms";
import { PI_BAA_AGREE_COPY, PI_BAA_INTRO, PI_BAA_SECTIONS, PI_BAA_TITLE, PI_BAA_VERSION } from "@/lib/pi-baa";

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
  }),
  component: BaaPage,
});

function BaaPage() {
  const [agreed, setAgreed] = useState(false);
  return (
    <PiPublicPage>
      <main className="wrap pi-home-article">
        <p className="pi-home-kicker">{PI_LEGAL_NAME}</p>
        <h1>{PI_BAA_TITLE}</h1>
        <p className="pi-home-lede" style={{ marginBottom: 8 }}>
          Version {PI_BAA_VERSION}
        </p>
        <p className="pi-home-lede">{PI_BAA_INTRO}</p>

        {PI_BAA_SECTIONS.map((section) => (
          <section key={section.heading} className="mt-12">
            <h2>{section.heading}</h2>
            <div className="page-copy">
              {section.paras.map((para) => (
                <p key={para}>{para}</p>
              ))}
            </div>
          </section>
        ))}

        <label
          className="mt-12 flex items-start gap-3 rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--ink)" }}
          data-testid="baa-agree"
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            data-testid="baa-agree-checkbox"
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span data-testid="baa-agree-copy">{PI_BAA_AGREE_COPY}</span>
        </label>
      </main>
    </PiPublicPage>
  );
}
