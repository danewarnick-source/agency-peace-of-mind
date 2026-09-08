import { createFileRoute } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { PI_HOME_SERIF, PI_PRIVACY_INTRO, PI_PRIVACY_PARAS, PI_PRIVACY_TITLE } from "@/lib/pi-homepage";
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
    <PiPublicPage home>
      <main className="wrap" style={{ padding: "56px 24px 96px" }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#7a8599",
          }}
        >
          {PI_LEGAL_NAME}
        </p>
        <h1
          style={{
            margin: "12px 0 16px",
            fontFamily: PI_HOME_SERIF,
            fontWeight: 400,
            fontSize: "clamp(36px, 6vw, 56px)",
            color: "#f4efe3",
          }}
        >
          {PI_PRIVACY_TITLE}
        </h1>
        <p style={{ maxWidth: "36em", color: "#aeb7c9", lineHeight: 1.6 }}>{PI_PRIVACY_INTRO}</p>
        <div style={{ display: "grid", gap: 16, maxWidth: "36em", marginTop: 28 }}>
          {PI_PRIVACY_PARAS.map((para) => (
            <p key={para} style={{ margin: 0, color: "#aeb7c9", lineHeight: 1.6, fontSize: 16 }}>
              {para}
            </p>
          ))}
        </div>
      </main>
    </PiPublicPage>
  );
}
