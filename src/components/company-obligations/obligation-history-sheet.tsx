// History panel for a single Company Obligation: every instance, reverse
// chronological, with completed/not-submitted lists, inline admin notes,
// waive, and manual-completion entry points.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { waiveInstance, type CompanyObligationRow, type ObligationInstanceRow } from "@/lib/company-obligations.functions";
import { ManualCompletionDialog } from "./obligation-card";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusBadgeVariant(status: ObligationInstanceRow["status"]): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "completed": return "default";
    case "overdue": return "destructive";
    case "waived": return "outline";
    default: return "secondary";
  }
}

function InstanceRow({
  orgId,
  instance,
  onManualCompletion,
}: {
  orgId: string;
  instance: ObligationInstanceRow;
  onManualCompletion: (instanceId: string) => void;
}) {
  const qc = useQueryClient();
  const waiveFn = useServerFn(waiveInstance);
  const [notes, setNotes] = useState(instance.admin_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");

  const { data } = useQuery({
    queryKey: ["obligation-instance-detail", instance.id],
    queryFn: async () => {
      const [{ data: assignees, error: aErr }, { data: completions, error: cErr }] = await Promise.all([
        supabase.from("company_obligation_instance_assignees").select("staff_id, staff_name").eq("instance_id", instance.id),
        supabase.from("company_obligation_completions").select("staff_id, staff_name, completed_at, evidence_type_used").eq("instance_id", instance.id),
      ]);
      if (aErr) throw new Error(aErr.message);
      if (cErr) throw new Error(cErr.message);
      return {
        assignees: (assignees ?? []) as Array<{ staff_id: string; staff_name: string }>,
        completions: (completions ?? []) as Array<{ staff_id: string; staff_name: string; completed_at: string | null; evidence_type_used: string | null }>,
      };
    },
  });

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase
      .from("company_obligation_instances")
      .update({ admin_notes: notes })
      .eq("id", instance.id);
    setSavingNotes(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Notes saved");
    qc.invalidateQueries({ queryKey: ["obligation-history", instance.obligation_id] });
  };

  const waive = useMutation({
    mutationFn: () => waiveFn({ data: { organizationId: orgId, instanceId: instance.id, waiveReason: waiveReason.trim() } }),
    onSuccess: () => {
      toast.success("Instance waived");
      setWaiveOpen(false);
      qc.invalidateQueries({ queryKey: ["obligation-history", instance.obligation_id] });
      qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completedIds = new Set((data?.completions ?? []).map((c) => c.staff_id));
  const notSubmitted = (data?.assignees ?? []).filter((a) => !completedIds.has(a.staff_id));
  const canWaive = instance.status === "pending" || instance.status === "overdue";

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{instance.period_key}</p>
          <p className="text-xs text-muted-foreground">Due {formatDate(instance.due_at)}</p>
        </div>
        <Badge variant={statusBadgeVariant(instance.status)} className="capitalize">{instance.status}</Badge>
      </div>

      {data && (
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <p className="font-medium text-muted-foreground">Completed</p>
            {data.completions.length === 0 ? (
              <p className="text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-0.5">
                {data.completions.map((c) => (
                  <li key={c.staff_id}>{c.staff_name} — {formatDate(c.completed_at)} ({c.evidence_type_used ?? "—"})</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-medium text-muted-foreground">Not submitted</p>
            {notSubmitted.length === 0 ? (
              <p className="text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-0.5">
                {notSubmitted.map((a) => <li key={a.staff_id}>{a.staff_name}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Admin notes</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={saveNotes} disabled={savingNotes}>Save notes</Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onManualCompletion(instance.id)}>Add manual completion</Button>
        {canWaive && !waiveOpen && (
          <Button size="sm" variant="outline" onClick={() => setWaiveOpen(true)}>Waive</Button>
        )}
      </div>
      {waiveOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            placeholder="Reason for waiving…"
            className="h-8 flex-1 min-w-[160px] text-sm"
          />
          <Button size="sm" variant="ghost" onClick={() => setWaiveOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={!waiveReason.trim() || waive.isPending} onClick={() => waive.mutate()}>
            Confirm waive
          </Button>
        </div>
      )}
    </div>
  );
}

export function ObligationHistorySheet({
  open,
  onOpenChange,
  orgId,
  obligation,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  obligation: CompanyObligationRow;
}) {
  const [manualInstanceId, setManualInstanceId] = useState<string | null>(null);

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ["obligation-history", obligation.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_obligation_instances")
        .select("*")
        .eq("obligation_id", obligation.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ObligationInstanceRow[];
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>History — {obligation.title}</SheetTitle>
          <SheetDescription>All instances, most recent first.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : instances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No instances yet.</p>
          ) : (
            instances.map((inst) => (
              <InstanceRow
                key={inst.id}
                orgId={orgId}
                instance={inst}
                onManualCompletion={setManualInstanceId}
              />
            ))
          )}
        </div>
      </SheetContent>

      <ManualCompletionDialog
        open={!!manualInstanceId}
        onOpenChange={(v) => !v && setManualInstanceId(null)}
        orgId={orgId}
        instanceId={manualInstanceId}
      />
    </Sheet>
  );
}
