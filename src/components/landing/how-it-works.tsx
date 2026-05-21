const steps = [
  { n: "01", title: "Create your workspace", desc: "Sign up and invite your team by email. Roles set the right access for admins, managers, and employees." },
  { n: "02", title: "Assign training", desc: "Pick from our library or upload your own. Set due dates and track progress automatically." },
  { n: "03", title: "Certify & renew", desc: "Certificates issue the moment courses are completed — with renewals scheduled before they expire." },
];

export function HowItWorks() {
  return (
    <section className="bg-secondary/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Up and running in under 10 minutes</h2>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-card)]">
              <span className="text-sm font-semibold text-accent">{s.n}</span>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
