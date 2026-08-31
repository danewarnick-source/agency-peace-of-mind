import { Hexagon } from "lucide-react";

export function FounderStory() {
  return (
    <section className="relative overflow-hidden bg-[var(--hive-sidebar)] text-[var(--hive-chrome-text)]">
      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hive-gold)]/25 bg-[color-mix(in_srgb,var(--hive-gold)_10%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--hive-gold)]">
            <Hexagon className="h-3.5 w-3.5" strokeWidth={2.5} />
            Built by a provider, not a vendor
          </span>

          <h2 className="font-display mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
            We run a DSPD agency in Utah.
          </h2>

          <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--hive-chrome-text)]/80">
            <p>
              Hive is the desk we needed when the national tools still treated us like home health.
              Host Home Supports is not home health. Hosts do not clock. The artifact is the daily
              note and the overnight confirmation — and the state already wrote the rules down.
            </p>
            <p>
              We lived the month-end scramble against authorizations, the DSPD review letter, and
              the stack of spreadsheets that did not quite line up with DHHS91172. The generic
              workforce apps could not bill the Community Supports Waiver. The national IDD systems
              asked us to teach them what SLH, DSI, and the Human Rights Committee were.
            </p>
            <p>
              So we built the desk for a Utah DSPD provider: the codes, the forms, the obligations
              loaded from the Scope of Work. It worked for us. Then other agencies asked if they
              could sit at it too.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
