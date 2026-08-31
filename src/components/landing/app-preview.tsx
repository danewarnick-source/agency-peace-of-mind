import {
  BarChart3,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  Plug,
  Send,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { HiveMark } from "@/components/brand/hive-mark";

const NAV = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: BarChart3, label: "Operations" },
  { icon: GraduationCap, label: "Training" },
  { icon: ShieldCheck, label: "Compliance" },
  { icon: Users, label: "People" },
  { icon: BarChart3, label: "Reports" },
  { icon: Plug, label: "Integrations" },
  { icon: Settings, label: "Settings" },
  { icon: HelpCircle, label: "Help" },
] as const;

function Spark({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 72 24" className="h-6 w-16 text-[var(--hive-gold)]" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        points={up ? "0,18 12,14 24,16 36,8 48,11 60,4 72,7" : "0,6 12,10 24,8 36,16 48,13 60,20 72,17"}
      />
    </svg>
  );
}

export function LandingAppPreview() {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-xl border border-[var(--hive-border)] bg-[var(--hive-canvas)] shadow-[var(--shadow-elegant)]"
    >
      <div className="flex min-h-[420px]">
        <div className="hidden w-[72px] shrink-0 flex-col items-center gap-3 bg-[var(--hive-sidebar)] py-4 sm:flex">
          <HiveMark className="h-7 w-7" />
          <div className="mt-2 flex w-full flex-col items-center gap-1 px-1.5">
            {NAV.map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={`relative flex w-full flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[8px] ${
                  active
                    ? "hive-nav-active"
                    : "text-[var(--hive-chrome-text)]/70"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 bg-[var(--hive-canvas)] p-4">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Active users", value: "248", delta: "+4.2%", up: true },
              { label: "Open training", value: "36", delta: "−2.1%", up: false },
              { label: "Compliance score", value: "94%", delta: "+1.8%", up: true },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)] p-3"
              >
                <div className="text-[10px] text-[var(--hive-text-muted)]">{m.label}</div>
                <div className="mt-1 flex items-end justify-between gap-1">
                  <div className="font-display text-xl font-semibold text-[var(--hive-text)]">
                    {m.value}
                  </div>
                  <Spark up={m.up} />
                </div>
                <div
                  className="mt-1 text-[10px]"
                  style={{ color: m.up ? "var(--hive-ok)" : "var(--hive-danger)" }}
                >
                  {m.delta}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <div className="rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--hive-text-muted)]">
                Operations
              </div>
              <ul className="mt-2 space-y-1.5 text-[11px] text-[var(--hive-text)]">
                <li className="flex justify-between">
                  <span>Open tasks</span>
                  <span className="tabular-nums">23</span>
                </li>
                <li className="flex justify-between">
                  <span>Overdue</span>
                  <span className="tabular-nums text-[var(--hive-danger)]">4</span>
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--hive-text-muted)]">
                Training
              </div>
              <div className="mt-3 flex items-center justify-center">
                <div className="relative grid h-16 w-16 place-items-center rounded-full border-[5px] border-[var(--hive-gold)]">
                  <span className="text-sm font-semibold text-[var(--hive-text)]">68%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden w-[168px] shrink-0 flex-col border-l border-[var(--hive-border)] bg-[var(--hive-sidebar)] p-3 lg:flex">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--hive-gold)]">
            <HiveMark className="h-3.5 w-3.5" />
            Nectar
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-[var(--hive-text-muted)]">
            Hi Alex, how can I help?
          </p>
          <div className="mt-3 space-y-1.5">
            {["Compliance score", "Overdue training"].map((p) => (
              <div
                key={p}
                className="rounded-md border border-[var(--hive-border)] bg-[var(--hive-surface)] px-2 py-1.5 text-[9px] text-[var(--hive-text)]"
              >
                {p}
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center gap-1.5 pt-3">
            <div className="h-7 flex-1 rounded border border-[var(--hive-border)] bg-[var(--hive-canvas)]" />
            <div className="grid h-7 w-7 place-items-center rounded bg-[var(--hive-gold)] text-[var(--hive-on-gold)]">
              <Send className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
