import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Hive Training — assigned in Hive" },
      {
        name: "description",
        content:
          "Staff complete assigned training inside Hive on My Obligations. Agencies do not sell seats to staff. True North Supports stays $0.",
      },
      { property: "og:title", content: "Hive Training — assigned in Hive" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TrainingExplainer,
});

function TrainingExplainer() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-4 pb-16 pt-16 sm:px-6 md:pt-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Hive Training
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground">
            Staff training lives inside Hive
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Staff never buy seats. An admin submits a class roster for CPR, Mandt, or the training
            package. Assigned work shows up on My Obligations. True North Supports is always $0.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/contact">Contact us</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
