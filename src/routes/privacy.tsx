import { createFileRoute } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { PI_PRIVACY_INTRO, PI_PRIVACY_PARAS, PI_PRIVACY_TITLE } from "@/lib/pi-homepage";
import { PI_LEGAL_NAME } from "@/lib/pi-terms";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Provider Interface" },
      { name: "description", content: "How Provider Interface LLC treats information you put in the product." },
      { property: "og:title", content: "Privacy — Provider Interface" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PiPublicPage>
      <main className="wrap pi-home-article">
        <p className="pi-home-kicker">{PI_LEGAL_NAME}</p>
        <h1>{PI_PRIVACY_TITLE}</h1>
        <p className="pi-home-lede">{PI_PRIVACY_INTRO}</p>
        <div className="page-copy">
          {PI_PRIVACY_PARAS.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>
      </main>
    </PiPublicPage>
  );
}
