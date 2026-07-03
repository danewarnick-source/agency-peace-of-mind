import { Link } from "@tanstack/react-router";
import { CheckCircle2, Lock, Plus } from "lucide-react";

export type StaffTrainingStatus = {
  baselineKey: string;
  title: string;
  status: "certified" | "missing";
  completedAt: string | null;
  expiresAt: string | null;
  courseId: string | null;
};

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Compact per-staff DSPD training strip shown under each roster row.
 *
 * Certified baselines render as a green pill with completion → expiration
 * dates. Missing baselines render as an "Assign" button that deep-links to
 * the HIVE Training hub so the admin can allocate a seat. When the org
 * hasn't opted into HIVE Training the button is disabled with a lock hint.
 */
export function StaffTrainingStrip({
  trainings,
  hiveTrainingEnabled,
}: {
  trainings: StaffTrainingStatus[];
  hiveTrainingEnabled: boolean;
}) {
  if (trainings.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-2">
      {trainings.map((t) => {
        if (t.status === "certified") {
          return (
            <span
              key={t.baselineKey}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300"
              title={`Completed ${fmt(t.completedAt)}${t.expiresAt ? ` · Renews ${fmt(t.expiresAt)}` : ""}`}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span className="truncate max-w-[180px]">{t.title}</span>
              <span className="text-emerald-600/80 dark:text-emerald-400/80">
                {fmt(t.completedAt)}
                {t.expiresAt ? ` → ${fmt(t.expiresAt)}` : ""}
              </span>
            </span>
          );
        }
        if (!hiveTrainingEnabled) {
          return (
            <span
              key={t.baselineKey}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              title="Enable HIVE Training on your plan to assign this course."
            >
              <Lock className="h-3 w-3" />
              <span className="truncate max-w-[180px]">{t.title}</span>
            </span>
          );
        }
        return (
          <Link
            key={t.baselineKey}
            to="/dashboard/hive-training"
            className="inline-flex items-center gap-1 rounded-full border border-[#C8881E]/40 bg-[#C8881E]/10 px-2 py-0.5 text-[11px] font-medium text-[#C8881E] hover:bg-[#C8881E]/20 transition-colors"
            title={`Assign ${t.title} on the HIVE Training hub`}
          >
            <Plus className="h-3 w-3" />
            <span className="truncate max-w-[180px]">Assign: {t.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
