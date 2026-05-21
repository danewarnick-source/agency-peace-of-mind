import { GraduationCap, Activity, FileCheck2 } from "lucide-react";

const features = [
  {
    icon: GraduationCap,
    title: "Structured Training",
    desc: "Interactive, role-based modules built around DSPD requirements. Onboard new staff in days, not weeks.",
  },
  {
    icon: Activity,
    title: "Automated Tracking",
    desc: "Real-time certification monitoring with smart alerts before anything expires. Never miss a renewal.",
  },
  {
    icon: FileCheck2,
    title: "Audit-Ready Reports",
    desc: "One-click compliance logs that map directly to inspector checklists. Walk into any audit prepared.",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Three pillars</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Everything your agency needs to stay compliant
          </h2>
          <p className="mt-4 text-muted-foreground">
            Replace spreadsheets, sticky notes, and email reminders with one calm, structured system.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group relative rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-primary-foreground">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
