import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getStaffAnnualHoursDetail,
  addStaffHoursEntry,
  deleteStaffHoursEntry,
  type AnnualHoursProgress,
} from "@/lib/hr-training-hours.functions";

export function statusColor(s: AnnualHoursProgress["status"]) {
  switch (s) {
    case "complete":
    case "on_target":
      return "bg-emerald-500";
    case "behind":
      return "bg-amber-500";
    case "tracking_pre_tenure":
    case "no_hire_date":
    default:
      return "bg-muted-foreground/40";
  }
}

export function statusLabel(s: AnnualHoursProgress["status"]) {
  switch (s) {
    case "complete":
      return "Complete";
    case "on_target":
      return "On target";
    case "behind":
      return "Behind";
    case "tracking_pre_tenure":
      return "Tracking · required after 1 yr";
    case "no_hire_date":
      return "No hire date";
  }
}

/** Compact progress meter cell — used inside the HR Compliance Matrix table. */
export function AnnualHoursCell({
  progress,
}: {
  progress: AnnualHoursProgress;
}) {
  const pct = Math.min(
    100,
    Math.round((progress.hours_to_date / Math.max(1, progress.target_hours)) * 100),
  );
  const color = statusColor(progress.status);
  const textTone =
    progress.status === "behind"
      ? "text-amber-700"
      : progress.status === "tracking_pre_tenure"
        ? "text-muted-foreground"
        : "text-foreground";
  const title = [
    `${progress.hours_to_date} / ${progress.target_hours} hrs`,
    progress.window_start && progress.window_end
      ? `Window: ${progress.window_start} → ${progress.window_end}`
      : "No employment-year window (missing hire date)",
    progress.enforced
      ? `Target to date: ${progress.target_to_date} hr (${progress.months_elapsed_in_window} mo elapsed)`
      : "Pre-tenure · informational only",
    `Status: ${statusLabel(progress.status)}`,
  ].join("\n");

  return (
    <div title={title} className="inline-flex w-full flex-col items-center gap-1 px-1">
      <div className={`text-[10px] font-medium leading-none ${textTone}`}>
        {progress.hours_to_date}/{progress.target_hours}
      </div>
      <div className="h-1.5 w-full max-w-[56px] overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!progress.enforced && (
        <div className="text-[8px] uppercase leading-none tracking-wide text-muted-foreground">
          tracking
        </div>
      )}
    </div>
  );
}

/** Full progress + entry log section, rendered inside the staff HR card. */
export function AnnualHoursSection({
  organizationId,
  staffId,
  canEdit,
}: {
  organizationId: string;
  staffId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getStaffAnnualHoursDetail);
  const addFn = useServerFn(addStaffHoursEntry);
  const delFn = useServerFn(deleteStaffHoursEntry);
  const q = useQuery({
    queryKey: ["staff-annual-hours", organizationId, staffId],
    queryFn: () =>
      fetchDetail({
        data: { organization_id: organizationId, staff_id: staffId },
      }),
  });

  const [draftReqId, setDraftReqId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    hours: "",
    note: "",
  });

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: ["staff-annual-hours", organizationId, staffId],
    });
    qc.invalidateQueries({ queryKey: ["hr-matrix", organizationId] });
    qc.invalidateQueries({ queryKey: ["hr-rollup", organizationId] });
  };

  const addMutation = useMutation({
    mutationFn: async (requirementId: string) => {
      const hrs = Number(draft.hours);
      if (!Number.isFinite(hrs) || hrs <= 0) throw new Error("Enter hours > 0");
      await addFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          requirement_id: requirementId,
          entry_date: draft.entry_date,
          hours: hrs,
          note: draft.note || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Hours logged");
      setDraftReqId(null);
      setDraft({
        entry_date: new Date().toISOString().slice(0, 10),
        hours: "",
        note: "",
      });
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMutation = useMutation({
    mutationFn: async (entryId: string) =>
      delFn({ data: { organization_id: organizationId, entry_id: entryId } }),
    onSuccess: () => {
      toast.success("Entry removed");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading training
          hours…
        </CardContent>
      </Card>
    );
  }
  const details = q.data ?? [];
  if (details.length === 0) return null;

  return (
    <div className="space-y-4">
      {details.map((d) => {
        const pct = Math.min(
          100,
          Math.round((d.hours_to_date / Math.max(1, d.target_hours)) * 100),
        );
        const color = statusColor(d.status);
        return (
          <Card key={d.config.requirement_id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span>{d.config.title}</span>
                <Badge variant="secondary" className="text-[10px]">
                  cumulative · {d.config.target_hours} hrs / employment year
                </Badge>
                {d.enforced ? (
                  d.status === "complete" ? (
                    <Badge className="bg-emerald-600 text-white">Complete</Badge>
                  ) : d.status === "on_target" ? (
                    <Badge className="bg-emerald-600 text-white">On target</Badge>
                  ) : (
                    <Badge variant="destructive">Behind</Badge>
                  )
                ) : (
                  <Badge variant="outline">
                    Tracking · required after 1 yr
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <div className="font-medium">
                    {d.hours_to_date} / {d.target_hours} hrs
                  </div>
                  <div className="text-xs text-muted-foreground">
                    target to date: {d.target_to_date} hr (
                    {d.months_elapsed_in_window} mo elapsed)
                  </div>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {d.window_start && d.window_end ? (
                    <>
                      Window: {d.window_start} → {d.window_end} · training{" "}
                      {d.training_hours} hr · manual {d.manual_hours} hr
                    </>
                  ) : (
                    "No employment-year window — hire date missing on this staffer's profile."
                  )}
                </div>
              </div>

              {d.training_contributions.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    From signed trainings this window
                  </div>
                  <ul className="space-y-1 text-xs">
                    {d.training_contributions
                      .filter((c) => {
                        if (!d.window_start || !d.window_end) return false;
                        const ts = new Date(c.completed_at).getTime();
                        return (
                          ts >= new Date(d.window_start).getTime() &&
                          ts < new Date(d.window_end).getTime()
                        );
                      })
                      .map((c) => (
                        <li
                          key={c.training_completion_id}
                          className="flex items-center justify-between rounded-md border border-border/40 px-2 py-1"
                        >
                          <span className="inline-flex items-center gap-1">
                            <GraduationCap className="h-3 w-3 text-emerald-700" />
                            {c.topic_title}
                          </span>
                          <span className="text-muted-foreground">
                            {c.hours} hr ·{" "}
                            {new Date(c.completed_at).toLocaleDateString()}
                            {c.hours_source === "fallback_one_hour" &&
                              " · default"}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">
                    Manual entries
                  </div>
                  {canEdit && draftReqId !== d.config.requirement_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftReqId(d.config.requirement_id)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Log hours
                    </Button>
                  )}
                </div>
                {canEdit && draftReqId === d.config.requirement_id && (
                  <div className="mb-2 grid gap-2 rounded-md border border-border/60 p-2 sm:grid-cols-4">
                    <div>
                      <Label className="text-[11px]">Date</Label>
                      <Input
                        type="date"
                        value={draft.entry_date}
                        onChange={(e) =>
                          setDraft({ ...draft, entry_date: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Hours</Label>
                      <Input
                        type="number"
                        step="0.25"
                        min="0.25"
                        max="24"
                        value={draft.hours}
                        onChange={(e) =>
                          setDraft({ ...draft, hours: e.target.value })
                        }
                        placeholder="1.5"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-[11px]">Note</Label>
                      <Input
                        value={draft.note}
                        onChange={(e) =>
                          setDraft({ ...draft, note: e.target.value })
                        }
                        placeholder="What was the training?"
                      />
                    </div>
                    <div className="sm:col-span-4 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          addMutation.mutate(d.config.requirement_id)
                        }
                        disabled={addMutation.isPending}
                      >
                        Save entry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDraftReqId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {d.entries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No manual hours logged yet.
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {d.entries.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between rounded-md border border-border/40 px-2 py-1"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{e.hours} hr</span>
                          <span className="ml-2 text-muted-foreground">
                            {e.entry_date}
                          </span>
                          {e.note && (
                            <span className="ml-2 text-muted-foreground">
                              · {e.note}
                            </span>
                          )}
                          {e.created_by_name && (
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              logged by {e.created_by_name}
                            </span>
                          )}
                        </div>
                        {canEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              if (confirm("Remove this hours entry?")) {
                                delMutation.mutate(e.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
