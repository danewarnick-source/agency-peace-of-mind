// Time-correction request review — supervisor approve/deny surface.
// Previously the ONLY working screen for this lived on the old
// dashboard/compliance-desk "Needs Review" tab. This section pulls the
// same evv_timesheets rows (review_status = 'needs_review') into
// Documentation > Records > Needs attention so nothing goes stale on the
// hidden page. All approve/deny semantics mirror the old compliance desk
// exactly (see reviewApprove/reviewReject in dashboard.compliance-desk.tsx):
//  • Approve → sets review_status='approved', stamps reviewed_by/at.
//    downstream effectiveBillingTimes() then bills the corrected times.
//  • Reject  → requires a note, sets review_status='rejected' + review_note,
//    caregiver sees a "correction rejected — resubmit" state on punch pad.
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X, Flag, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isEvvLockedCode } from "@/lib/evv-codes";
import { toast } from "sonner";

type Row = {
  id: string;
  staff_id: string;
  client_id: string;
  service_type_code: string;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  edit_reason: string | null;
  incident_flag: boolean | null;
  clients: { first_name: string | null; last_name: string | null } | null;
  staff_name?: string;
};

const SELECT_COLS =
  "id, staff_id, client_id, service_type_code, clock_in_timestamp, clock_out_timestamp, corrected_clock_in, corrected_clock_out, edit_reason, incident_flag, clients:client_id(first_name,last_name)";

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : "—";
}
function varianceMinutes(r: Row): number | null {
  const rawIn = r.clock_in_timestamp ? new Date(r.clock_in_timestamp).getTime() : NaN;
  const rawOut = r.clock_out_timestamp ? new Date(r.clock_out_timestamp).getTime() : NaN;
  const corrIn = r.corrected_clock_in ? new Date(r.corrected_clock_in).getTime() : NaN;
  const corrOut = r.corrected_clock_out ? new Date(r.corrected_clock_out).getTime() : NaN;
  if (![rawIn, rawOut, corrIn, corrOut].every(Number.isFinite)) return null;
  return Math.round(((corrOut - corrIn) - (rawOut - rawIn)) / 60_000);
}

export function TimeCorrectionReviewSection({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const q = useQuery({
    enabled: !!organizationId,
    queryKey: ["records-needs-review", organizationId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(SELECT_COLS)
        .eq("organization_id", organizationId)
        .eq("review_status", "needs_review")
        .order("clock_in_timestamp", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Row[];
      const ids = Array.from(new Set(rows.map((r) => r.staff_id)));
      if (ids.length) {
        const { data: dir } = await supabase
          .from("org_member_directory")
          .select("id, full_name, email")
          .in("id", ids);
        const nm = new Map(
          ((dir ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
            (d) => [d.id, d.full_name ?? d.email ?? d.id.slice(0, 8)],
          ),
        );
        rows.forEach((r) => { r.staff_name = nm.get(r.staff_id) ?? r.staff_id.slice(0, 8); });
      }
      return rows;
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          review_status: "approved",
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Correction approved — corrected times now bill.");
      qc.invalidateQueries({ queryKey: ["records-needs-review"] });
      qc.invalidateQueries({ queryKey: ["records"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reject = useMutation({
    mutationFn: async (payload: { id: string; note: string }) => {
      const note = payload.note.trim();
      if (!note) throw new Error("A reviewer note is required to deny.");
      const { error } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          review_status: "rejected",
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          review_note: note,
        } as any)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Returned to caregiver — they will see a resubmit prompt.");
      qc.invalidateQueries({ queryKey: ["records-needs-review"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  if (q.isLoading) return null;
  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border-l-4 border-l-amber-500 border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0B1126]">
            <Clock className="h-4 w-4 text-amber-600" /> Time-correction requests
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Staff-submitted corrections awaiting your decision. Approving makes the corrected times the official billable times; denying returns the shift with your note so the caregiver can resubmit.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">{rows.length} awaiting review</Badge>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <TimeCorrectionCard
            key={r.id}
            row={r}
            onApprove={(id) => approve.mutate(id)}
            onReject={(id, note) => reject.mutate({ id, note })}
            approving={approve.isPending}
            rejecting={reject.isPending}
          />
        ))}
      </div>
    </section>
  );
}

function TimeCorrectionCard({
  row, onApprove, onReject, approving, rejecting,
}: {
  row: Row;
  onApprove: (id: string) => void;
  onReject: (id: string, note: string) => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const [note, setNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const variance = varianceMinutes(row);
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {row.staff_name ?? row.staff_id.slice(0, 8)} →{" "}
            <span>{row.clients?.first_name} {row.clients?.last_name}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            <Badge variant="outline" className="mr-1.5 font-mono text-[10px]">{row.service_type_code}</Badge>
            {isEvvLockedCode(row.service_type_code) ? "EVV-locked" : "Non-EVV"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge className="bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            Time correction requested
          </Badge>
          {row.incident_flag && (
            <Badge className="bg-rose-100 text-[10px] text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
              <Flag className="mr-1 h-3 w-3" /> Incident flagged
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Original (recorded)</p>
          <p className="mt-1 font-mono text-xs">In: {fmtTs(row.clock_in_timestamp)}</p>
          <p className="font-mono text-xs">Out: {fmtTs(row.clock_out_timestamp)}</p>
        </div>
        <div className="rounded-lg border border-amber-400/50 bg-amber-50/40 p-2.5 dark:bg-amber-500/5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Caregiver requested</p>
          <p className="mt-1 font-mono text-xs">In: {fmtTs(row.corrected_clock_in)}</p>
          <p className="font-mono text-xs">Out: {fmtTs(row.corrected_clock_out)}</p>
          {variance !== null && (
            <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              Variance: {variance >= 0 ? "+" : ""}{variance} min
            </p>
          )}
        </div>
      </div>

      {row.edit_reason && (
        <div className="rounded-lg border border-border bg-card p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Caregiver reason</p>
          <p className="mt-1 text-xs leading-relaxed">{row.edit_reason}</p>
        </div>
      )}

      {showReject ? (
        <div className="space-y-2">
          <Label className="text-xs">Reason for denial (required)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Why is this being denied? The caregiver will see this."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowReject(false); setNote(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={rejecting || note.trim().length === 0}
              onClick={() => onReject(row.id, note)}
            >
              {rejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Deny & return to caregiver"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowReject(true)}>
            <X className="mr-1 h-3.5 w-3.5" /> Deny
          </Button>
          <Button size="sm" disabled={approving} onClick={() => onApprove(row.id)}>
            {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" /> Approve correction</>}
          </Button>
        </div>
      )}
    </div>
  );
}
