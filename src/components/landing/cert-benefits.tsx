import { CheckCircle2 } from "lucide-react";

const benefits = [
  "Never miss a renewal with automatic expiration alerts",
  "Public verification URLs auditors and clients can check instantly",
  "Centralized records — no more chasing PDFs across inboxes",
  "Built-in audit log of every completion and re-certification",
];

export function CertBenefits() {
  return (
    <section className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">Certification tracking</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Compliance evidence at your fingertips</h2>
            <p className="mt-4 text-muted-foreground">
              HIVE stores every certificate, every completion date, and every renewal in one
              tamper-evident log — so you can prove compliance in minutes, not days.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" /> {b}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-[image:var(--gradient-hero)] p-8 text-white shadow-[var(--shadow-elegant)]">
            <p className="text-xs uppercase tracking-wider text-white/60">Certificate preview</p>
            <div className="mt-4 rounded-xl border border-white/20 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs uppercase tracking-wider text-white/60">Certificate of Completion</p>
              <p className="mt-4 text-2xl font-semibold">Maria Gonzalez</p>
              <p className="mt-1 text-sm text-white/70">has completed</p>
              <p className="mt-1 text-lg font-medium">HIPAA Privacy & Security</p>
              <div className="mt-6 flex items-end justify-between text-xs text-white/60">
                <div>Issued · May 12, 2026</div>
                <div className="font-mono">VERIFY: a3f9-2c1e-88d4</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
