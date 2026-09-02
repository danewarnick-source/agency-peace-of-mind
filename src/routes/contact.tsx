import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Contact } from "@/components/landing/contact";
import { Footer } from "@/components/landing/footer";

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
    <div className="flex min-h-screen flex-col bg-[#0b1220] text-[#f3efe6]">
      <SiteHeader />
      <main className="flex-1 pt-12">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h1
            className="text-4xl font-medium tracking-tight md:text-5xl"
            style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
          >
            We'd love to hear from you
          </h1>
          <p className="mt-4 text-[#f3efe6]/62">Questions, the office, custom rollouts — drop us a note.</p>
        </div>
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
