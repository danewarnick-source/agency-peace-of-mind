const quotes = [
  { q: "Our last audit took twenty minutes. It used to take a week.", who: "Erin Walsh", role: "Director of Operations, Cascade Care" },
  { q: "Onboarding a new hire went from two weeks of paperwork to two clicks.", who: "Marcus Liu", role: "HR Lead, Northbay Support Services" },
  { q: "Every certificate, every renewal, in one place. It just works.", who: "Priya Shah", role: "Compliance Manager, Bright Path" },
];

export function Testimonials() {
  return (
    <section className="bg-secondary/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Loved by teams</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Trusted by modern agencies</h2>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {quotes.map((q) => (
            <figure key={q.who} className="rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-card)]">
              <blockquote className="text-base leading-relaxed">&ldquo;{q.q}&rdquo;</blockquote>
              <figcaption className="mt-6 text-sm">
                <div className="font-semibold">{q.who}</div>
                <div className="text-muted-foreground">{q.role}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
