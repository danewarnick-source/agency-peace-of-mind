import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, ArrowLeft, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { getMyClientTrainingStatuses } from "@/lib/client-specific-training.functions";

export const Route = createFileRoute("/dashboard/my-client-trainings")({
  component: MyClientTrainings,
});

type TrainingType = "person_specific" | "support_strategies" | "person_centered";

type TrainingItem = {
  type: TrainingType;
  label: string;
  setupStatus: "not_setup" | "draft" | "published";
  completionStatus: "not_started" | "completed";
  completedAt?: string | null;
};

type ClientItem = {
  clientId: string;
  clientName: string;
  trainings: TrainingItem[];
};

type Row = {
  clientId: string;
  clientName: string;
  training: TrainingItem;
};

function MyClientTrainings() {
  const fetchCT = useServerFn(getMyClientTrainingStatuses);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-client-training-statuses"],
    queryFn: () => fetchCT(),
    staleTime: 60_000,
  });

  const items = (data?.items ?? []) as ClientItem[];
  const rows: Row[] = [];
  for (const it of items) {
    for (const t of it.trainings ?? []) {
      if (t.setupStatus !== "published") continue;
      rows.push({ clientId: it.clientId, clientName: it.clientName, training: t });
    }
  }
  rows.sort((a, b) => {
    const ar = a.training.completionStatus === "not_started" ? 0 : 1;
    const br = b.training.completionStatus === "not_started" ? 0 : 1;
    if (ar !== br) return ar - br;
    const n = a.clientName.localeCompare(b.clientName);
    if (n !== 0) return n;
    return a.training.label.localeCompare(b.training.label);
  });

  return (
    <div className="space-y-4 pb-2">
      <StaffPageHeader
        eyebrow="For your caseload"
        eyebrowIcon={GraduationCap}
        title="Client Trainings"
        subtitle="Trainings you need to complete for the people you support."
      />

      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>

      {isLoading && (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-300/60 bg-rose-500/5 p-4 text-sm text-rose-700">
          Couldn't load client trainings. Pull to refresh or try again shortly.
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          No client trainings assigned right now. When a training is published for someone you support, it'll appear here.
        </div>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const due = r.training.completionStatus === "not_started";
            return (
              <li key={`${r.clientId}:${r.training.type}`}>
                <Link
                  to="/dashboard/client-training/$clientId"
                  params={{ clientId: r.clientId }}
                  search={{ trainingType: r.training.type }}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition hover:border-primary/50 hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {r.clientName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.training.label}
                    </div>
                  </div>
                  {due ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Review required
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completed
                      {r.training.completedAt
                        ? ` · ${new Date(r.training.completedAt).toLocaleDateString()}`
                        : ""}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
