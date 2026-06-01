import { Link } from "@tanstack/react-router";
import { UserPlus, Activity, CheckCircle2, ArrowRight } from "lucide-react";

export type PipelineCounts = { invited: number; inProgress: number; complete: number };

export function OnboardingPipelineCard({ counts }: { counts: PipelineCounts }) {
  const total = counts.invited + counts.inProgress + counts.complete;
  const stages = [
    { key: "invited", label: "Invited", value: counts.invited, icon: UserPlus, to: "/dashboard/invitations" },
    { key: "in_progress", label: "In progress", value: counts.inProgress, icon: Activity, to: "/dashboard/employees" },
    { key: "complete", label: "Complete", value: counts.complete, icon: CheckCircle2, to: "/dashboard/employees" },
  ] as const;

  return (
    <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight">Onboarding pipeline</h2>
        <Link to="/dashboard/employees" className="inline-flex items-center gap-1 text-xs font-medium text-[#7a4a0a] hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          No one in the pipeline yet — invite your first staff member from Quick actions.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-3">
          {stages.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.key}>
                <Link
                  to={s.to}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 transition hover:border-[#f4a93a]/40"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
                    <p className="font-display text-xl font-bold tabular-nums text-[#0d112b]">{s.value}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
