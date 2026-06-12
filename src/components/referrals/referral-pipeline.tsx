import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Phone,
  Plus,
  Users,
  Video,
  XCircle,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  REFERRAL_STAGES,
  REFERRAL_STAGE_LABEL,
  addReferralActivity,
  editReferralNote,
  listReferralActivities,
  updateReferralStage,
  type ReferralStage,
} from "@/lib/referrals.functions";

type Activity = Awaited<ReturnType<typeof listReferralActivities>>[number];

const CHANNEL_LABEL: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  in_person: "In person",
  zoom: "Zoom",
};

function ChannelIcon({ ch }: { ch: string | null }) {
  if (ch === "phone") return <Phone className="h-3.5 w-3.5" />;
  if (ch === "zoom") return <Video className="h-3.5 w-3.5" />;
  if (ch === "in_person") return <Users className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
}

export function ReferralStageBadge({ stage }: { stage: ReferralStage }) {
  const tone: Record<ReferralStage, string> = {
    new: "bg-slate-100 text-slate-700",
    reviewing: "bg-sky-100 text-sky-800",
    initial_contact: "bg-indigo-100 text-indigo-800",
    iso_meeting: "bg-violet-100 text-violet-800",
    follow_up: "bg-amber-100 text-amber-800",
    decision: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone[stage]}`}
    >
      {REFERRAL_STAGE_LABEL[stage]}
    </span>
  );
}

// ─── Stage advancer ──────────────────────────────────────────

export function StageAdvancer({
  organizationId,
  referralId,
  currentStage,
  onChanged,
}: {
  organizationId: string;
  referralId: string;
  currentStage: ReferralStage;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateReferralStage);
  const [pendingDecision, setPendingDecision] = useState(false);
  const [outcome, setOutcome] = useState<"placed" | "passed">("placed");
  const [reason, setReason] = useState("");

  const mutate = useMutation({
    mutationFn: (vars: {
      stage: ReferralStage;
      decision_outcome?: "placed" | "passed";
      decision_reason?: string;
    }) =>
      updateFn({
        data: {
          organization_id: organizationId,
          referral_id: referralId,
          stage: vars.stage,
          decision_outcome: vars.decision_outcome ?? null,
          decision_reason: vars.decision_reason ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Stage updated");
      qc.invalidateQueries({ queryKey: ["referrals", organizationId] });
      qc.invalidateQueries({ queryKey: ["referral-activities", referralId] });
      qc.invalidateQueries({ queryKey: ["referral-pipeline-stats", organizationId] });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onChange = (next: string) => {
    const stage = next as ReferralStage;
    if (stage === currentStage) return;
    if (stage === "decision") {
      setPendingDecision(true);
      return;
    }
    mutate.mutate({ stage });
  };

  return (
    <>
      <Select value={currentStage} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REFERRAL_STAGES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {REFERRAL_STAGE_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={pendingDecision} onOpenChange={setPendingDecision}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decision</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Outcome</Label>
              <Select
                value={outcome}
                onValueChange={(v) => setOutcome(v as "placed" | "passed")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placed">Placed</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dec-reason">Reason (for win/loss reporting)</Label>
              <Textarea
                id="dec-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDecision(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                mutate.mutate({
                  stage: "decision",
                  decision_outcome: outcome,
                  decision_reason: reason || undefined,
                });
                setPendingDecision(false);
                setReason("");
              }}
              disabled={mutate.isPending}
            >
              Save decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Detail dialog: activity timeline ─────────────────────────

export function ReferralDetailDialog({
  organizationId,
  referralId,
  open,
  onOpenChange,
}: {
  organizationId: string;
  referralId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const listFn = useServerFn(listReferralActivities);
  const addFn = useServerFn(addReferralActivity);
  const editFn = useServerFn(editReferralNote);
  const qc = useQueryClient();

  const activities = useQuery({
    enabled: !!referralId && open,
    queryKey: ["referral-activities", referralId],
    queryFn: () =>
      listFn({
        data: {
          organization_id: organizationId,
          referral_id: referralId!,
        },
      }),
  });

  const [type, setType] = useState<"contact" | "meeting" | "note" | "email">(
    "contact",
  );
  const [channel, setChannel] = useState<"phone" | "email" | "in_person" | "zoom">(
    "phone",
  );
  const [occurredAt, setOccurredAt] = useState<string>("");
  const [body, setBody] = useState("");

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          organization_id: organizationId,
          referral_id: referralId!,
          activity_type: type,
          channel: type === "note" ? null : channel,
          occurred_at: occurredAt
            ? new Date(occurredAt).toISOString()
            : new Date().toISOString(),
          body: body || null,
        },
      }),
    onSuccess: () => {
      toast.success("Activity logged");
      setBody("");
      setOccurredAt("");
      qc.invalidateQueries({ queryKey: ["referral-activities", referralId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Compute the "current" view of the timeline: rows that are NOT superseded
  // by another row. Superseded rows are still rendered but collapsed.
  const { current, supersededIds } = useMemo(() => {
    const rows = activities.data ?? [];
    const supersededSet = new Set<string>();
    rows.forEach((r) => {
      if (r.supersedes_id) supersededSet.add(r.supersedes_id);
    });
    return {
      current: rows.filter((r) => !supersededSet.has(r.id)),
      supersededIds: supersededSet,
    };
  }, [activities.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Referral activity</DialogTitle>
        </DialogHeader>

        {/* Logger */}
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as typeof type)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type !== "note" && (
              <div>
                <Label>Channel</Label>
                <Select
                  value={channel}
                  onValueChange={(v) => setChannel(v as typeof channel)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="in_person">In person</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>When</Label>
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                type === "note"
                  ? "Internal note…"
                  : "What was discussed? Outcome?"
              }
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => add.mutate()}
              disabled={add.isPending || !referralId}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Log activity
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-3 space-y-2">
          {activities.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : current.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            current.map((a) => (
              <ActivityRow
                key={a.id}
                activity={a}
                allActivities={activities.data ?? []}
                organizationId={organizationId}
                editFn={editFn}
                onSaved={() =>
                  qc.invalidateQueries({
                    queryKey: ["referral-activities", referralId],
                  })
                }
              />
            ))
          )}

          {/* Superseded chain viewer */}
          {supersededIds.size > 0 && (
            <details className="mt-3 rounded-md border border-dashed border-border bg-muted/20 p-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                <History className="mr-1 inline h-3 w-3" />
                {supersededIds.size} superseded entr
                {supersededIds.size === 1 ? "y" : "ies"} (history)
              </summary>
              <ul className="mt-2 space-y-1">
                {(activities.data ?? [])
                  .filter((r) => supersededIds.has(r.id))
                  .map((a) => (
                    <li
                      key={a.id}
                      className="rounded border border-border bg-background p-2 text-muted-foreground line-through"
                    >
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                        <ChannelIcon ch={a.channel} />
                        {a.activity_type}
                        {a.channel ? ` · ${CHANNEL_LABEL[a.channel]}` : ""}
                        <span className="ml-auto">
                          {new Date(a.occurred_at).toLocaleString()}
                        </span>
                      </div>
                      {a.body && <div className="mt-1 text-xs">{a.body}</div>}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActivityRow({
  activity,
  allActivities,
  organizationId,
  editFn,
  onSaved,
}: {
  activity: Activity;
  allActivities: Activity[];
  organizationId: string;
  editFn: (args: {
    data: { organization_id: string; original_id: string; body: string };
  }) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activity.body ?? "");

  // Chain: walk supersedes_id back to original
  const chain = useMemo(() => {
    const byId = new Map(allActivities.map((a) => [a.id, a] as const));
    const out: Activity[] = [];
    let cursor: Activity | undefined = activity;
    let depth = 0;
    while (cursor?.supersedes_id && depth < 10) {
      const prev = byId.get(cursor.supersedes_id);
      if (!prev) break;
      out.push(prev);
      cursor = prev;
      depth += 1;
    }
    return out;
  }, [activity, allActivities]);

  const save = useMutation({
    mutationFn: () =>
      editFn({
        data: {
          organization_id: organizationId,
          original_id: activity.id,
          body: draft.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Note edited (history preserved)");
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (activity.activity_type === "stage_change") {
    return (
      <div className="rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5" />
          Stage moved{" "}
          {activity.stage_from && (
            <Badge variant="outline" className="text-[10px]">
              {REFERRAL_STAGE_LABEL[
                activity.stage_from as ReferralStage
              ] ?? activity.stage_from}
            </Badge>
          )}
          →{" "}
          {activity.stage_to && (
            <Badge variant="outline" className="text-[10px]">
              {REFERRAL_STAGE_LABEL[
                activity.stage_to as ReferralStage
              ] ?? activity.stage_to}
            </Badge>
          )}
          <span className="ml-auto">
            {new Date(activity.occurred_at).toLocaleString()}
          </span>
        </div>
        {activity.body && <div className="mt-1">{activity.body}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <ChannelIcon ch={activity.channel} />
        <span>{activity.activity_type}</span>
        {activity.channel && <span>· {CHANNEL_LABEL[activity.channel]}</span>}
        {chain.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            edited
          </Badge>
        )}
        <span className="ml-auto">
          {new Date(activity.occurred_at).toLocaleString()}
        </span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setDraft(activity.body ?? "");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={!draft.trim() || save.isPending}
            >
              Save (preserves history)
            </Button>
          </div>
        </div>
      ) : (
        <>
          {activity.body && (
            <div className="mt-1 whitespace-pre-wrap">{activity.body}</div>
          )}
          {(activity.activity_type === "note" ||
            activity.activity_type === "contact" ||
            activity.activity_type === "meeting") && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Pipeline stats bar ──────────────────────────────────────

export function PipelineStatsBar({
  stats,
}: {
  stats:
    | {
        by_stage: Partial<Record<ReferralStage, number>>;
        placed: number;
        passed: number;
        total: number;
      }
    | undefined;
}) {
  if (!stats) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2 text-xs">
      <span className="font-semibold">Pipeline:</span>
      {REFERRAL_STAGES.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5"
        >
          {REFERRAL_STAGE_LABEL[s]}
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {stats.by_stage[s] ?? 0}
          </Badge>
        </span>
      ))}
      <span className="ml-auto inline-flex items-center gap-1 text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Placed: {stats.placed}
      </span>
      <span className="inline-flex items-center gap-1 text-slate-600">
        <XCircle className="h-3.5 w-3.5" />
        Passed: {stats.passed}
      </span>
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        Total active: {stats.total}
      </span>
    </div>
  );
}
