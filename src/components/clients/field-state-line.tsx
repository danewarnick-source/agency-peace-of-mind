// Tri-state line for a single tracked client field.
//   has     → "Recorded" badge
//   none    → positive statement ("Client does not take medications.")
//   unknown → admin-only "Not yet confirmed — NECTAR needs this" chip
//             linking to the Finish-onboarding wizard.
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ShieldCheck, HelpCircle } from "lucide-react";
import type { TrackedField, FieldState } from "@/lib/field-confirmations";

export function FieldStateLine({
  field, state, clientId, valueText,
}: {
  field: TrackedField;
  state: FieldState;
  clientId: string;
  /** Real recorded value (registry-backed) shown when state === "has". */
  valueText?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border border-border px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{field.label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground truncate">
          {state === "has" && (valueText && valueText.trim() ? valueText : "Recorded")}
          {state === "none" && field.positiveStatement}
          {state === "unknown" && "Not yet confirmed — NECTAR needs this"}
        </div>
      </div>

      {state === "has" && (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mr-1 h-3 w-3" /> has
        </Badge>
      )}
      {state === "none" && (
        <Badge variant="outline" className="text-slate-600">
          <ShieldCheck className="mr-1 h-3 w-3" /> none
        </Badge>
      )}
      {state === "unknown" && (
        <Link
          to="/dashboard/clients/$clientId"
          params={{ clientId }}
          className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <HelpCircle className="h-3 w-3" /> Confirm
        </Link>
      )}
    </div>
  );
}
