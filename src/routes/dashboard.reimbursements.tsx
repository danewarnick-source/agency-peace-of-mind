import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Receipt, Clock as ClockIcon, CheckCircle2, XCircle, Loader2, FileText,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/dashboard/reimbursements")({
  head: () => ({ meta: [{ title: "Activity Reimbursement Approvals — HIVE" }] }),
  component: ReimbursementApprovalsPage,
});

type Row = Tables<"activity_reimbursement_requests"> & {
  staff: { full_name: string | null; email: string | null } | null;
  client: { first_name: string; last_name: string } | null;
};

function ReimbursementApprovalsPage() {
  return (
    <RequirePermission perm="manage_users">
      <ApprovalsBody />
    </RequirePermission>
  );
}

function ApprovalsBody() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [decisioning, setDecisioning] = useState<Row | null>(null);

  const list = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["reimbursements-org", org?.organization_id, tab],
    refetchInterval: 15_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("activity_reimbursement_requests")
        .select(
          "*, staff:staff_id(full_name, email), client:client_id(first_name, last_name)",
        )
        .eq("organization_id", org!.organization_id)
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reimbursements-org", org?.organization_id] });

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <Receipt className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Activity Reimbursements</h1>
          <p className="text-sm text-muted-foreground">
            Review in-shift reimbursement requests submitted by staff.
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="pending" className="gap-1">
            <ClockIcon className="h-3.5 w-3.5" /> Pending
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approved
          </TabsTrigger>
          <TabsTrigger value="denied" className="gap-1">
            <XCircle className="h-3.5 w-3.5" /> Denied
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {list.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !list.data?.length ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No {tab} requests.
            </Card>
          ) : (
            list.data.map((r) => (
              <RequestRow
                key={r.id}
                row={r}
                onDecide={() => setDecisioning(r)}
                onChange={invalidate}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <DecisionDialog
        row={decisioning}
        onClose={() => setDecisioning(null)}
        onDecided={invalidate}
      />
    </div>
  );
}

function RequestRow({
  row, onDecide, onChange,
}: { row: Row; onDecide: () => void; onChange: () => void }) {
  const tone =
    row.status === "approved"
      ? "border-emerald-300 bg-emerald-50/60"
      : row.status === "denied"
      ? "border-rose-300 bg-rose-50/60"
      : "border-amber-300 bg-amber-50/60";

  return (
    <Card className={`border ${tone} p-4`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{row.activity_description}</h3>
            <Badge variant="outline" className="font-mono">
              ${Number(row.estimated_cost).toFixed(2)}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Staff: {row.staff?.full_name || row.staff?.email || "—"}
            {row.client && ` · Client: ${row.client.first_name} ${row.client.last_name}`}
            {" · Submitted "}{new Date(row.created_at).toLocaleString()}
          </p>
          <p className="mt-2 text-sm">{row.reason}</p>

          {row.status !== "pending" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Reviewed {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : ""}
              {row.review_note ? ` — “${row.review_note}”` : ""}
            </p>
          )}

          {row.status === "approved" && (
            <PaperworkPreview row={row} onChange={onChange} />
          )}
        </div>

        {row.status === "pending" && (
          <Button
            onClick={onDecide}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            Review
          </Button>
        )}
      </div>
    </Card>
  );
}

function PaperworkPreview({ row, onChange: _onChange }: { row: Row; onChange: () => void }) {
  const receipts = row.receipt_paths ?? [];

  const open = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("activity-receipts")
      .createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Could not open receipt.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-background/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        End-of-shift paperwork {row.summary_submitted_at ? "" : "(pending)"}
      </p>
      {row.event_summary && (
        <p className="mt-1 text-sm">{row.event_summary}</p>
      )}
      {receipts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {receipts.map((p) => (
            <li key={p}>
              <button
                onClick={() => open(p)}
                className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
              >
                <FileText className="h-3 w-3" />
                {p.split("/").pop()}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!row.summary_submitted_at && !receipts.length && (
        <p className="mt-1 text-[12px] italic text-muted-foreground">
          Waiting for staff to upload receipts and event summary at end of shift.
        </p>
      )}
    </div>
  );
}

function DecisionDialog({
  row, onClose, onDecided,
}: { row: Row | null; onClose: () => void; onDecided: () => void }) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(status: "approved" | "denied") {
    if (!row || !user) return;
    if (status === "denied" && note.trim().length < 3) {
      toast.error("Add a note explaining the denial.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("activity_reimbursement_requests")
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_note: note.trim() || null,
        })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`Request ${status}.`);
      setNote("");
      onDecided();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not save decision.");
    } finally {
      setBusy(false);
    }
  }

  const open = !!row;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review reimbursement request</DialogTitle>
          <DialogDescription>
            {row?.activity_description} — ${row ? Number(row.estimated_cost).toFixed(2) : "0.00"}
          </DialogDescription>
        </DialogHeader>
        {row && <p className="text-sm text-muted-foreground">{row.reason}</p>}
        <div className="mt-3">
          <Label htmlFor="rev-note" className="text-xs font-medium">
            Reviewer note (optional, required for denial)
          </Label>
          <Textarea
            id="rev-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="Add context for the staff member."
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => decide("denied")}
            disabled={busy}
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deny
          </Button>
          <Button
            onClick={() => decide("approved")}
            disabled={busy}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
