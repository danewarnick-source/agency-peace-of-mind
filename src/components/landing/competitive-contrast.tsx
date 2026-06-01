import { Clock, Pill, FileCheck2 } from "lucide-react";

const contrasts = [
  {
    icon: Clock,
    title: "EVV that actually bills",
    body: "Generic apps aren't EVV-compliant under the 21st Century Cures Act — which means you still need a separate system to bill. HIVE's EVV is built to the standard and reconciles to your authorizations automatically.",
  },
  {
    icon: Pill,
    title: "A real eMAR",
    body: "Medication administration, PRN reasons, vitals and seizure logs — documented to the standard of care, exceptions flagged the moment they happen. Workforce apps have no concept of a client receiving care, so they have no MAR at all.",
  },
  {
    icon: FileCheck2,
    title: "Audit artifacts, not just data",
    body: "PCSPs, HCBS service codes, 520s, and one-click compliance packets — the paperwork the state actually requires. Generic tools give you timesheets. HIVE gives you proof.",
  },
];

export function CompetitiveContrast() {
  return (
    <section className="bg-surface-warm py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-hive-teal-700">
            Why not a generic workforce app?
          </span>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Scheduling and a time clock won't get you paid.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Plenty of apps will let you build a schedule and punch a clock. None of that matters
            if you can't bill Medicaid, document a medication pass, or hand an auditor what they
            actually asked for. The all-in-one workforce tools are a mile wide and built for
            construction crews and coffee shops — not for an individual receiving care under
            a state waiver.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {contrasts.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-hive-teal-300 hover:shadow-elegant"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-hive-teal-700 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              <div className="absolute -right-8 -top-8 h-24 w-24 clip-hex bg-hive-teal-100 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <p className="mx-auto max-w-2xl text-sm font-medium leading-relaxed text-foreground">
            The difference is simple: those tools manage your employees. HIVE is built around
            the person receiving care — and keeps you compliant and paid.
          </p>
        </div>
      </div>
    </section>
  );
}
