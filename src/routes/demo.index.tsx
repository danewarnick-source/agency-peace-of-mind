import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Footer } from "@/components/landing/footer";
import { HiveMark } from "@/components/brand/hive-mark";
import { DemoHoneycomb, DemoLandingHeader, DemoPageShell } from "@/components/landing/demo-landing";

export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [
      { title: "Hive landing previews" },
      {
        name: "description",
        content: "Three walkable Hive marketing landing previews. Not the live homepage.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DemoPickerPage,
});

const PREVIEWS = [
  {
    to: "/demo/a" as const,
    letter: "A",
    label: "Split",
    line: "The day stays in one place.",
  },
  {
    to: "/demo/b" as const,
    letter: "B",
    label: "Magazine",
    line: "The desk your staff actually use.",
  },
  {
    to: "/demo/c" as const,
    letter: "C",
    label: "Reverse",
    line: "Run the agency without chasing paperwork.",
  },
];

function DemoPickerPage() {
  return (
    <DemoPageShell>
      <DemoLandingHeader
        links={[
          { href: "/demo/a", label: "A" },
          { href: "/demo/b", label: "B" },
          { href: "/demo/c", label: "C" },
        ]}
      />

      <header className="relative z-0 overflow-hidden bg-[var(--hive-bg)]">
        <DemoHoneycomb />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--hive-gold)]">
            Preview only
          </p>
          <h1 className="font-display mt-3 text-4xl font-bold leading-[1.08] tracking-tight text-[var(--hive-text)] sm:text-5xl">
            Three ways to land.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[var(--hive-text-muted)]">
            Click through A, B, and C. These pages are drafts for review — the live homepage is
            unchanged.
          </p>
        </div>
      </header>

      <section className="bg-[var(--hive-bg)] pb-20">
        <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {PREVIEWS.map((preview) => (
            <Link
              key={preview.to}
              to={preview.to}
              className="group rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-6 shadow-[var(--shadow-soft)] transition hover:border-[var(--hive-gold)]/50 hover:shadow-[var(--shadow-elegant)]"
            >
              <div className="flex items-center justify-between">
                <HiveMark className="h-7 w-7" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--hive-gold)]">
                  {preview.letter} · {preview.label}
                </span>
              </div>
              <h2 className="font-display mt-6 text-2xl font-semibold tracking-tight text-[var(--hive-text)]">
                {preview.line}
              </h2>
              <p className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-[var(--hive-gold)]">
                Open preview
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </p>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </DemoPageShell>
  );
}
