import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared visual framing for client-profile sections. Used across every
 * client-profile tab (Profile, Care, Activity, Funds, Files, PCSP) so the
 * whole area reads as one design system:
 *   - `SectionPanel` — the lifted card with soft shadow, colored left
 *     accent bar, and a small icon chip in the top-left corner.
 *   - `SectionGroup` — the uppercase group label + optional right-aligned
 *     descriptor that clusters related panels together.
 *
 * Purely presentational. All logic lives in the wrapped panels.
 */

export type SectionAccent =
  | "indigo"
  | "violet"
  | "amber"
  | "rose"
  | "sky"
  | "orange"
  | "teal"
  | "emerald"
  | "slate"
  | "cyan";

const accentMap: Record<SectionAccent, { bar: string; chipBg: string; chipFg: string }> = {
  indigo: { bar: "bg-indigo-500", chipBg: "bg-indigo-50", chipFg: "text-indigo-600" },
  violet: { bar: "bg-violet-500", chipBg: "bg-violet-50", chipFg: "text-violet-600" },
  amber: { bar: "bg-amber-500", chipBg: "bg-amber-50", chipFg: "text-amber-600" },
  rose: { bar: "bg-rose-500", chipBg: "bg-rose-50", chipFg: "text-rose-600" },
  sky: { bar: "bg-sky-500", chipBg: "bg-sky-50", chipFg: "text-sky-600" },
  orange: { bar: "bg-orange-500", chipBg: "bg-orange-50", chipFg: "text-orange-600" },
  teal: { bar: "bg-teal-500", chipBg: "bg-teal-50", chipFg: "text-teal-600" },
  emerald: { bar: "bg-emerald-500", chipBg: "bg-emerald-50", chipFg: "text-emerald-600" },
  slate: { bar: "bg-slate-500", chipBg: "bg-slate-100", chipFg: "text-slate-600" },
  cyan: { bar: "bg-cyan-500", chipBg: "bg-cyan-50", chipFg: "text-cyan-600" },
};

export function SectionPanel({
  icon: Icon,
  accent,
  children,
}: {
  icon: LucideIcon;
  accent: SectionAccent;
  children: ReactNode;
}) {
  const a = accentMap[accent];
  return (
    <div className="relative group">
      <div
        className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${a.bar} opacity-80`}
        aria-hidden
      />
      <div
        className={`absolute -left-3 top-4 z-10 h-8 w-8 rounded-full ${a.chipBg} ${a.chipFg} flex items-center justify-center shadow-sm ring-1 ring-black/5`}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="pl-4 rounded-lg transition-shadow [&>*]:shadow-sm [&>*:hover]:shadow-md">
        {children}
      </div>
    </div>
  );
}

export function SectionGroup({
  label,
  hint,
  divider,
  children,
}: {
  label: string;
  hint?: string;
  divider?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={divider ? "space-y-5 pt-8 border-t border-border/60" : "space-y-5"}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h2>
        {hint ? <span className="text-xs text-muted-foreground/80">{hint}</span> : null}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

// Backwards-compat aliases: the Care tab originally shipped these names.
export { SectionPanel as CareSection, SectionGroup as CareGroup };
