import { ArrowRight, CircleAlert } from "lucide-react";
import type { PacketNextAction } from "@/lib/obligations/packet";

function urgencyClass(urgency: PacketNextAction["urgency"]): string {
  if (urgency === "critical") return "border-rose-300 bg-rose-50 text-rose-950";
  if (urgency === "high") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-[var(--hive-gold)]/40 bg-[#fff7ed] text-[var(--hive-text)]";
}

export function PacketNextActionCard({
  nextAction,
  emptyLabel,
}: {
  nextAction: PacketNextAction | null | undefined;
  emptyLabel: string;
}) {
  if (!nextAction) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${urgencyClass(nextAction.urgency)}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">Next action</p>
      <p className="mt-1 font-semibold">{nextAction.title}</p>
      <p className="mt-0.5 text-sm">{nextAction.reason}</p>
      <a
        href={nextAction.href}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline"
      >
        Open
        <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function PacketScopeNote({ scoped, count }: { scoped: boolean; count: number }) {
  if (!scoped) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>Showing your scope only ({count} staff). Org-wide view returns when Scope is unset.</p>
    </div>
  );
}
