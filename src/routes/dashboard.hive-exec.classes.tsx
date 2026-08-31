import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { Button } from "@/components/ui/button";
import {
  listTrainingClassesForExec,
  markTrainingClassComplete,
  type TrainingClassRow,
} from "@/lib/training-class.functions";
import { trainingClassLabel, trainingClassUnitCents, type TrainingClassType } from "@/lib/training-class";
import { formatUsdFromCents } from "@/lib/hive-pricing";
import { ClassCardStatus } from "@/components/training/class-card-upload";

export const Route = createFileRoute("/dashboard/hive-exec/classes")({
  head: () => ({ meta: [{ title: "Training — Hive Executive" }] }),
  component: () => (
    <RequireHiveExecutive>
      <ExecClassesPage />
    </RequireHiveExecutive>
  ),
});

const TYPES: TrainingClassType[] = ["cpr_first_aid", "mandt", "package"];

function ExecClassesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTrainingClassesForExec);
  const markFn = useServerFn(markTrainingClassComplete);
  const [bucket, setBucket] = useState<"upcoming" | "past">("upcoming");

  const q = useQuery({
    queryKey: ["hive-exec-training-classes"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });

  const upcoming = useMemo(
    () => (q.data ?? []).filter((c) => c.status === "upcoming"),
    [q.data],
  );
  const past = useMemo(
    () => (q.data ?? []).filter((c) => c.status !== "upcoming"),
    [q.data],
  );
  const shown = bucket === "upcoming" ? upcoming : past;

  const markDone = async (id: string) => {
    try {
      await markFn({ data: { class_id: id } });
      toast.success("Class marked complete.");
      qc.invalidateQueries({ queryKey: ["hive-exec-training-classes"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the class.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Hive Executive</div>
          <h2 className="font-display text-xl font-semibold">Training</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One row per class an admin submitted. CPR and Mandt are external. The package includes those plus the in-Hive 30-day course.
          </p>
        </div>
        <div className="inline-flex rounded-lg border bg-card p-1 text-sm">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${bucket === "upcoming" ? "bg-[var(--hive-text)] text-white" : "text-muted-foreground"}`}
            onClick={() => setBucket("upcoming")}
          >
            Upcoming ({upcoming.length})
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 ${bucket === "past" ? "bg-[var(--hive-text)] text-white" : "text-muted-foreground"}`}
            onClick={() => setBucket("past")}
          >
            Past ({past.length})
          </button>
        </div>
      </div>

      {TYPES.map((type) => {
        const rows = shown.filter((c) => c.trainingType === type);
        return (
          <section key={type} className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="h-4 w-4 text-[var(--hive-gold)]" />
              {trainingClassLabel(type)}
            </h3>
            {q.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading classes…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {bucket} {trainingClassLabel(type)} classes.</p>
            ) : (
              <div className="space-y-3">
                {rows.map((c) => (
                  <ClassCard key={c.id} row={c} onComplete={() => markDone(c.id)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ClassCard({ row, onComplete }: { row: TrainingClassRow; onComplete: () => void }) {
  return (
    <div className="rounded-lg border p-3" data-testid={`exec-class-${row.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            to="/dashboard/hive-exec/$orgId"
            params={{ orgId: row.organizationId }}
            className="font-medium text-[var(--hive-text)] hover:underline"
          >
            {row.providerName}
          </Link>
          <div className="text-xs text-muted-foreground">
            {row.seatCount} staff · {formatUsdFromCents(trainingClassUnitCents(row.trainingType))} / seat ·{" "}
            {row.amountCents === 0 ? "$0 charged" : formatUsdFromCents(row.amountCents)} · submitted{" "}
            {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "—"}
            {" · "}
            <ClassCardStatus row={row} />
          </div>
        </div>
        {row.status === "upcoming" && (
          <Button size="sm" variant="outline" onClick={onComplete}>
            Mark class done
          </Button>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {row.roster.map((r) => (
          <li key={`${r.email}-${r.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{r.name}</span>
            <span className="text-xs text-muted-foreground">
              {r.cardStatus === "in" ? "Card in" : "Card not in"}
            </span>
            <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-[var(--hive-gold)] hover:underline">
              <Mail className="h-3 w-3" /> {r.email}
            </a>
            {r.phone ? (
              <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-[var(--hive-gold)] hover:underline">
                <Phone className="h-3 w-3" /> {r.phone}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
