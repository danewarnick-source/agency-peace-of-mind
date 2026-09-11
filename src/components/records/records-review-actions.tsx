import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { fromLocalInput, saveRecordFields } from "@/lib/records-edit";
import {
  ACCEPT_ATTESTATION_TEXT,
  REVIEW_ACTION_LABEL,
  acceptGeofencePatch,
  actionsForExceptions,
  approveTimesheetPatch,
  flagTimesheetPatch,
  trimClockOutPatch,
  type ReviewAction,
} from "@/lib/records-review-actions";
import type { ReviewExceptionCode } from "@/lib/records-review-rules";
import { askStaffOnTimesheet } from "@/lib/threads.functions";

export type ReviewableRow = {
  id: string;
  staff_id: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  corrected_clock_out: string | null;
  rounded_clock_out: string | null;
  edit_audit_history_log: unknown;
  exceptions: Array<{ code: ReviewExceptionCode }>;
};

function invalidateRecords(qc: ReturnType<typeof useQueryClient>, orgId: string) {
  void qc.invalidateQueries({ queryKey: ["records"] });
  void qc.invalidateQueries({ queryKey: ["evv-pending"] });
  void qc.invalidateQueries({ queryKey: ["evv-approved"] });
  void qc.invalidateQueries({ queryKey: ["evv-needs-review"] });
  void qc.invalidateQueries({ queryKey: ["evv-reconcile"] });
  void qc.invalidateQueries({ queryKey: ["threads", orgId] });
}

export function RecordsReviewActions({
  row,
  compact = false,
}: {
  row: ReviewableRow;
  compact?: boolean;
}) {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const askFn = useServerFn(askStaffOnTimesheet);
  const orgId = org?.organization_id ?? null;
  const reviewerName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Administrator";

  const [open, setOpen] = useState<ReviewAction | null>(null);
  const [question, setQuestion] = useState("");
  const [note, setNote] = useState("");
  const [trimTo, setTrimTo] = useState("");
  const [signedName, setSignedName] = useState(reviewerName);
  const [signedTitle, setSignedTitle] = useState("");
  const [attest, setAttest] = useState(false);

  const actions = actionsForExceptions(row.exceptions.map((e) => e.code));
  if (!orgId || actions.length === 0) return null;

  const run = useMutation({
    mutationFn: async (action: ReviewAction) => {
      if (action === "ask") {
        const res = await askFn({
          data: {
            organizationId: orgId,
            timesheetId: row.id,
            question,
          },
        });
        if (!res.softReady) {
          throw new Error("Ask staff is pending Soft Core (threads tables).");
        }
        if (!res.ok) throw new Error("Ask staff failed.");
        return;
      }
      if (action === "approve") {
        const patch = approveTimesheetPatch({
          reviewerId: user?.id ?? null,
          note,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("evv_timesheets")
          .update(patch)
          .eq("id", row.id);
        if (error) throw error;
        return;
      }
      if (action === "trim") {
        const patch = trimClockOutPatch({
          clockInIso: row.clock_in_timestamp,
          trimToIso: fromLocalInput(trimTo),
        });
        await saveRecordFields({
          row: {
            id: row.id,
            edit_audit_history_log: Array.isArray(row.edit_audit_history_log)
              ? row.edit_audit_history_log
              : [],
          },
          updates: patch,
          adminName: reviewerName,
          userId: user?.id ?? null,
        });
        return;
      }
      if (action === "accept") {
        if (!attest) throw new Error("Confirm the attestation to accept.");
        const patch = acceptGeofencePatch({
          reviewerName,
          signedName,
          signedTitle,
          notes: note,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("evv_timesheets")
          .update(patch)
          .eq("id", row.id);
        if (error) throw error;
        return;
      }
      const patch = flagTimesheetPatch({ reviewerName, notes: note });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("evv_timesheets")
        .update(patch)
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: (_res, action) => {
      invalidateRecords(qc, orgId);
      setOpen(null);
      setQuestion("");
      setNote("");
      toast.success(`${REVIEW_ACTION_LABEL[action]} saved.`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    },
  });

  return (
    <div
      className={compact ? "flex flex-wrap gap-1" : "flex flex-wrap gap-2"}
      onClick={(e) => e.stopPropagation()}
    >
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant={action === "flag" ? "destructive" : "outline"}
          onClick={() => setOpen(action)}
        >
          {REVIEW_ACTION_LABEL[action]}
        </Button>
      ))}

      <Dialog open={open !== null} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {open ? REVIEW_ACTION_LABEL[open] : "Records review"}
            </DialogTitle>
          </DialogHeader>
          {open === "ask" && (
            <div className="space-y-2">
              <Label htmlFor="ask-q">Question for staff</Label>
              <Textarea
                id="ask-q"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What time did you actually leave?"
              />
              <p className="text-[11px] text-muted-foreground">
                Creates a shift thread, notifies the staff member, and sends
                email/SMS without client details.
              </p>
            </div>
          )}
          {open === "trim" && (
            <div className="space-y-2">
              <Label htmlFor="trim-to">Trim clock-out to</Label>
              <Input
                id="trim-to"
                type="datetime-local"
                value={trimTo}
                onChange={(e) => setTrimTo(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Writes corrected and rounded clock-out only. Raw punch time
                is not changed. Empty uses clock-in plus 8 hours.
              </p>
            </div>
          )}
          {open === "accept" && (
            <div className="space-y-2">
              <p className="text-xs">{ACCEPT_ATTESTATION_TEXT}</p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attest}
                  onChange={(e) => setAttest(e.target.checked)}
                  className="mt-1"
                />
                <span>I confirm the attestation is true.</span>
              </label>
              <Label htmlFor="signed-name">Full name</Label>
              <Input id="signed-name" value={signedName} onChange={(e) => setSignedName(e.target.value)} />
              <Label htmlFor="signed-title">Title</Label>
              <Input id="signed-title" value={signedTitle} onChange={(e) => setSignedTitle(e.target.value)} />
              <Label htmlFor="accept-note">Internal notes</Label>
              <Textarea id="accept-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          {(open === "approve" || open === "flag") && (
            <div className="space-y-2">
              <Label htmlFor="review-note">
                {open === "flag" ? "Flag note" : "Review note (optional)"}
              </Label>
              <Textarea id="review-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={run.isPending || (open === "ask" && question.trim().length === 0)}
              onClick={() => open && run.mutate(open)}
            >
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : open ? REVIEW_ACTION_LABEL[open] : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
