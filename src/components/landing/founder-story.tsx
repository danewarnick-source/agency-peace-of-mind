import { Hexagon, Crosshair } from "lucide-react";

export function FounderStory() {
  return (
    <section className="relative overflow-hidden bg-hive-navy-900 text-primary-foreground">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-20 -top-20 h-72 w-72 opacity-[0.04] clip-hex bg-nectar-gold-500" />
        <div className="absolute -left-16 bottom-10 h-56 w-56 opacity-[0.03] clip-hex bg-nectar-gold-500" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-nectar-gold-500/20 bg-nectar-gold-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-nectar-gold-300">
            <Hexagon className="h-3.5 w-3.5" strokeWidth={2.5} />
            Built by a provider, not a vendor
          </span>

          <h2 className="font-display mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
            We didn't set out to build software.
            <br />
            We set out to survive an audit.
          </h2>

          <div className="mt-6 space-y-4 text-base leading-relaxed text-white/75">
            <p>
              We run a disability support agency. We lived the 11 p.m. paperwork, the month-end
              scramble to reconcile EVV against authorizations, the cold dread of a DSPD audit
              letter and a stack of spreadsheets that didn't quite line up. We tried the tools
              that exist.
            </p>
            <p>
              The generic workforce apps couldn't bill a Medicaid waiver or track a medication.
              The clinical systems were built for someone else's state and buried our team in
              screens.
            </p>
            <p>
              So we built the thing we needed — a single platform where the schedule, the EVV
              punch, the MAR, the daily log, and the 520 all speak the same language and produce
              audit-ready proof on their own. It worked for us. Then other providers asked if
              they could use it too.
            </p>
          </div>

          <div className="mt-8 inline-flex items-center gap-3 rounded-xl border border-nectar-gold-500/20 bg-nectar-gold-500/10 px-5 py-3 text-sm font-medium text-nectar-gold-200">
            <Crosshair className="h-4 w-4 shrink-0 text-nectar-gold-400" />
            <span>
              HIVE is that platform. Built in Utah, by people who've actually billed the waiver —
              designed to travel to providers anywhere.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
