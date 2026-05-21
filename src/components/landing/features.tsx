import { GraduationCap, Award, Users, BarChart3, ShieldCheck, BellRing } from "lucide-react";

const features = [
  { icon: GraduationCap, title: "Course library", desc: "Pre-built training across compliance, safety, and care skills — plus your own custom courses." },
  { icon: Users, title: "Team management", desc: "Invite employees by email, organize by manager, and assign training in seconds." },
  { icon: Award, title: "Verifiable certificates", desc: "Auto-issued certificates with public verification links employers and auditors can trust." },
  { icon: BarChart3, title: "Progress dashboards", desc: "See real-time completion rates, overdue training, and renewal forecasts at a glance." },
  { icon: BellRing, title: "Renewal reminders", desc: "Automatic reminders for upcoming certificate expirations — no spreadsheets required." },
  { icon: ShieldCheck, title: "Role-based access", desc: "Admins, managers, and employees each see exactly what they need — nothing more." },
];

export function Features() {
  return (
    <section id="features" className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Platform</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Everything you need to train and certify your team</h2>
          <p className="mt-4 text-muted-foreground">Replace spreadsheets, sticky notes, and email reminders with one calm, structured system.</p>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group relative rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]">
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--gradient-brand)] text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
