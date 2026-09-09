import { createFileRoute } from "@tanstack/react-router";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { Contact } from "@/components/landing/contact";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Provider Interface" },
      { name: "description", content: "Get in touch about pricing, custom training, and enterprise rollouts." },
      { property: "og:title", content: "Contact — Provider Interface" },
      { property: "og:description", content: "Talk to our team about training, certification, and enterprise plans." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <PiPublicPage>
      <main className="wrap pi-home-contact">
        <h1>We'd love to hear from you</h1>
        <p className="pi-home-lede">Questions, the office, custom rollouts — drop us a note.</p>
        <Contact />
      </main>
    </PiPublicPage>
  );
}
