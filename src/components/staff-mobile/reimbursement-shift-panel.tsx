import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Receipt, Plus, Loader2, CheckCircle2, XCircle, Clock as ClockIcon,
  Upload, Trash2, FileText,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type ReimbursementRow = Tables<"activity_reimbursement_requests">;

interface Props {
  shiftId: string;
  clientId?: string | null;
}

const STATUS_META: Record<string, { label: string; tone: string; Icon: typeof ClockIcon }> = {
  pending:  { label: "Pending admin approval", tone: "bg-amber-100 text-amber-900 border-amber-300", Icon: ClockIcon },
  approved: { label: "Approved",                tone: "bg-emerald-100 text-emerald-900 border-emerald-300", Icon: CheckCircle2 },
  denied:   { label: "Denied",                  tone: "bg-rose-100 text-rose-900 border-rose-300", Icon: XCircle },
};

export function ReimbursementShiftPanel({ shiftId, clientId }: Props) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);

  const requests = useQuery({
    enabled: !!shiftId,
    queryKey: ["reimbursements-shift", shiftId],
    refetchInterval: 20_000,
    queryFn: async (): Promise<ReimbursementRow[]> => {
      const { data, error } = await supabase
        .from("activity_reimbursement_requests")
        .select("*")
        .eq("shift_id", shiftId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section
      aria-label="Activity Reimbursement"
      className="rounded-2xl border border-border bg-card/80 p-4 shadow-[var(--shadow-card)] backdrop-blur-sm"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <Receipt className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <h3 className="text-sm font-semibold">Activity Reimbursement</h3>
            <p className="text-[11px] text-muted-foreground">
              Unplanned outings during this shift
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setOpenNew(true)}
          className="h-9 gap-1 bg-amber-500 text-white hover:bg-amber-600"
        >
          <Plus className="h-4 w-4" /> Request
        </Button>
      </header>

      {requests.isLoading ? (
        <p className="py-3 text-center text-xs text-muted-foreground">Loading…</p>
      ) : !requests.data?.length ? (
        <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 text-center text-[12px] text-muted-foreground">
          No requests yet. Submit one if an unexpected, reimbursable activity comes up.
        </p>
      ) : (
        <ul className="space-y-2">
          {requests.data.map((r) => (
            <RequestCard key={r.id} req={r} onChange={() => qc.invalidateQueries({ queryKey: ["reimbursements-shift", shiftId] })} />
          ))}
        </ul>
      )}

      <NewRequestDialog
        open={openNew}
        onOpenChange={setOpenNew}
        shiftId={shiftId}
        clientId={clientId ?? null}
        organizationId={org?.organization_id ?? null}
        staffId={user?.id ?? null}
        onCreated={() => qc.invalidateQueries({ queryKey: ["reimbursements-shift", shiftId] })}
      />
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Single request card
// ──────────────────────────────────────────────────────────────────────────────

function RequestCard({ req, onChange }: { req: ReimbursementRow; onChange: () => void }) {
  const meta = STATUS_META[req.status] ?? STATUS_META.pending;
  const { Icon } = meta;
  const needsPaperwork = req.status === "approved" && !req.summary_submitted_at;

  return (
    <li className="rounded-lg border border-border bg-background/70 p-3">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{req.activity_description}</p>
        <Badge variant="outline" className={`shrink-0 gap-1 text-[10px] ${meta.tone}`}>
          <Icon className="h-3 w-3" /> {meta.label}
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Estimated&nbsp;${Number(req.estimated_cost).toFixed(2)} · {req.reason}
      </p>
      {req.review_note && (
        <p className="mt-1 text-[11px] italic text-muted-foreground">
          Reviewer note: {req.review_note}
        </p>
      )}
      {needsPaperwork && <PaperworkSection req={req} onSaved={onChange} />}
      {req.status === "approved" && req.summary_submitted_at && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> Paperwork complete · attached to shift record
        </p>
      )}
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Post-approval paperwork (receipts + summary)
// ──────────────────────────────────────────────────────────────────────────────

function PaperworkSection({ req, onSaved }: { req: ReimbursementRow; onSaved: () => void }) {
  const [summary, setSummary] = useState(req.event_summary ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${req.organization_id}/${req.shift_id}/${req.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("activity-receipts")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;

      const next = [...(req.receipt_paths ?? []), path];
      const { error } = await supabase
        .from("activity_reimbursement_requests")
        .update({ receipt_paths: next })
        .eq("id", req.id);
      if (error) throw error;
      toast.success("Receipt uploaded.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeReceipt(path: string) {
    try {
      await supabase.storage.from("activity-receipts").remove([path]);
      const next = (req.receipt_paths ?? []).filter((p) => p !== path);
      const { error } = await supabase
        .from("activity_reimbursement_requests")
        .update({ receipt_paths: next })
        .eq("id", req.id);
      if (error) throw error;
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Could not remove receipt.");
    }
  }

  async function submitPaperwork() {
    if (summary.trim().length < 10) {
      toast.error("Write a brief summary (10+ characters).");
      return;
    }
    if (!(req.receipt_paths ?? []).length) {
      toast.error("Upload at least one receipt before submitting.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("activity_reimbursement_requests")
        .update({
          event_summary: summary.trim(),
          summary_submitted_at: new Date().toISOString(),
        })
        .eq("id", req.id);
      if (error) throw error;
      toast.success("Paperwork attached to this shift.");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Could not save paperwork.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-amber-300 bg-amber-50/70 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
        End-of-shift paperwork required
      </p>

      <div>
        <Label className="text-[11px] font-medium">Receipts</Label>
        <div className="mt-1 space-y-1">
          {(req.receipt_paths ?? []).map((p) => (
            <div key={p} className="flex items-center justify-between gap-2 rounded border border-border bg-background/80 px-2 py-1 text-[11px]">
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono">{p.split("/").pop()}</span>
              </span>
              <button
                type="button"
                onClick={() => removeReceipt(p)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-rose-600 hover:bg-rose-50"
                aria-label="Remove receipt"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="w-full justify-center gap-1.5"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : "Upload receipt"}
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor={`summary-${req.id}`} className="text-[11px] font-medium">
          Brief event summary
        </Label>
        <Textarea
          id={`summary-${req.id}`}
          rows={3}
          maxLength={2000}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What did you do, where, how it went, any follow-ups."
          className="mt-1 text-sm"
        />
      </div>

      <Button
        onClick={submitPaperwork}
        disabled={busy}
        className="h-10 w-full bg-amber-500 text-white hover:bg-amber-600"
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Attach to shift record
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// New request dialog
// ──────────────────────────────────────────────────────────────────────────────

function NewRequestDialog({
  open, onOpenChange, shiftId, clientId, organizationId, staffId, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shiftId: string;
  clientId: string | null;
  organizationId: string | null;
  staffId: string | null;
  onCreated: () => void;
}) {
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!organizationId || !staffId) throw new Error("Missing org or user context.");
      const numericCost = Number(cost);
      if (description.trim().length < 3) throw new Error("Activity description is too short.");
      if (!Number.isFinite(numericCost) || numericCost < 0) throw new Error("Enter a valid cost.");
      if (reason.trim().length < 3) throw new Error("Reason is required.");

      const { error } = await supabase
        .from("activity_reimbursement_requests")
        .insert({
          organization_id: organizationId,
          shift_id: shiftId,
          staff_id: staffId,
          client_id: clientId,
          activity_description: description.trim(),
          estimated_cost: numericCost,
          reason: reason.trim(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request sent to admin for approval.");
      setDescription("");
      setCost("");
      setReason("");
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit request."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-amber-600" />
            Activity Reimbursement Request
          </DialogTitle>
          <DialogDescription>
            Quick request for an unplanned, reimbursable activity. An admin will review and you'll see status here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="rr-desc" className="text-xs font-medium">Activity description</Label>
            <Input
              id="rr-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Lunch outing at Lagoon"
              maxLength={2000}
            />
          </div>
          <div>
            <Label htmlFor="rr-cost" className="text-xs font-medium">Estimated cost (USD)</Label>
            <Input
              id="rr-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="rr-reason" className="text-xs font-medium">Reason</Label>
            <Textarea
              id="rr-reason"
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this is needed for the client / aligns with their plan."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
