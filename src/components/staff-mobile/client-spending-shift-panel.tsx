import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Wallet, Plus, Loader2, Upload, Trash2, FileText, Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type SpendRow = Tables<"client_spending_log">;

interface Props {
  shiftId: string;
  clientId: string;
}

export function ClientSpendingShiftPanel({ shiftId, clientId }: Props) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);

  const entries = useQuery({
    enabled: !!shiftId,
    queryKey: ["client-spending-shift", shiftId],
    queryFn: async (): Promise<SpendRow[]> => {
      const { data, error } = await supabase
        .from("client_spending_log")
        .select("*")
        .eq("shift_id", shiftId)
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = (entries.data ?? []).reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <section
      aria-label="Client Spending Log"
      className="rounded-2xl border border-border bg-card/80 p-4 shadow-[var(--shadow-card)] backdrop-blur-sm"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <Wallet className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <h3 className="text-sm font-semibold">Client Spending</h3>
            <p className="text-[11px] text-muted-foreground">
              Track the client's own money spent during this shift
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setOpenNew(true)}
          className="h-9 gap-1 bg-amber-500 text-white hover:bg-amber-600"
        >
          <Plus className="h-4 w-4" /> Entry
        </Button>
      </header>

      {entries.isLoading ? (
        <p className="py-3 text-center text-xs text-muted-foreground">Loading…</p>
      ) : !entries.data?.length ? (
        <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 text-center text-[12px] text-muted-foreground">
          No client spending logged yet for this shift.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {entries.data.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                canEdit={e.staff_id === user?.id}
                onChange={() => qc.invalidateQueries({ queryKey: ["client-spending-shift", shiftId] })}
              />
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-[12px]">
            <span className="text-muted-foreground">Shift total</span>
            <span className="font-semibold tabular-nums">${total.toFixed(2)}</span>
          </div>
        </>
      )}

      <NewEntryDialog
        open={openNew}
        onOpenChange={setOpenNew}
        shiftId={shiftId}
        clientId={clientId}
        organizationId={org?.organization_id ?? null}
        staffId={user?.id ?? null}
        onCreated={() => qc.invalidateQueries({ queryKey: ["client-spending-shift", shiftId] })}
      />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EntryCard({
  entry, canEdit, onChange,
}: { entry: SpendRow; canEdit: boolean; onChange: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadReceipt(file: File) {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${entry.organization_id}/${entry.shift_id}/${entry.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("client-spending-receipts")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("client_spending_log")
        .update({ receipt_path: path })
        .eq("id", entry.id);
      if (error) throw error;
      toast.success("Receipt attached.");
      onChange();
    } catch (e) {
      toast.error((e as Error).message || "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeEntry() {
    if (!confirm("Remove this spending entry?")) return;
    try {
      if (entry.receipt_path) {
        await supabase.storage.from("client-spending-receipts").remove([entry.receipt_path]);
      }
      const { error } = await supabase.from("client_spending_log").delete().eq("id", entry.id);
      if (error) throw error;
      toast.success("Entry removed.");
      onChange();
    } catch (e) {
      toast.error((e as Error).message || "Could not remove entry.");
    }
  }

  return (
    <li className="rounded-lg border border-border bg-background/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">{entry.purpose}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {format(new Date(entry.spent_at), "MMM d, p")}
          </p>
          {entry.notes && (
            <p className="mt-1 text-[11px] text-muted-foreground italic">{entry.notes}</p>
          )}
        </div>
        <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold tabular-nums text-amber-900">
          ${Number(entry.amount).toFixed(2)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {entry.receipt_path ? (
          <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            <FileText className="h-3 w-3" /> Receipt attached
          </span>
        ) : canEdit ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadReceipt(f);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="h-7 gap-1 px-2 text-[11px]"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />}
              Add receipt
            </Button>
          </>
        ) : null}
        {canEdit && (
          <button
            type="button"
            onClick={removeEntry}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] text-rose-600 hover:bg-rose-50"
            aria-label="Remove entry"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function NewEntryDialog({
  open, onOpenChange, shiftId, clientId, organizationId, staffId, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shiftId: string;
  clientId: string;
  organizationId: string | null;
  staffId: string | null;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = useMutation({
    mutationFn: async () => {
      if (!organizationId || !staffId) throw new Error("Missing org or user context.");
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount < 0) throw new Error("Enter a valid amount.");
      if (purpose.trim().length < 2) throw new Error("Describe what it was for.");

      const { data: inserted, error } = await supabase
        .from("client_spending_log")
        .insert({
          organization_id: organizationId,
          shift_id: shiftId,
          client_id: clientId,
          staff_id: staffId,
          amount: numericAmount,
          purpose: purpose.trim(),
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Optional receipt
      if (file && inserted) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${organizationId}/${shiftId}/${inserted.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("client-spending-receipts")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        await supabase
          .from("client_spending_log")
          .update({ receipt_path: path })
          .eq("id", inserted.id);
      }
    },
    onSuccess: () => {
      toast.success("Client spending logged.");
      setAmount(""); setPurpose(""); setNotes(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not save entry."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-600" />
            Log Client Spending
          </DialogTitle>
          <DialogDescription>
            Record money the client spent during this shift. Auto-stamped to the current shift.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="cs-amount" className="text-xs font-medium">Amount (USD)</Label>
            <Input
              id="cs-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="cs-purpose" className="text-xs font-medium">What it was for</Label>
            <Input
              id="cs-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Lunch at diner"
              maxLength={500}
            />
          </div>
          <div>
            <Label htmlFor="cs-notes" className="text-xs font-medium">Notes (optional)</Label>
            <Textarea
              id="cs-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context."
            />
          </div>
          <div>
            <Label className="text-xs font-medium">Receipt (optional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              className="mt-1 w-full justify-center gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              {file ? file.name : "Attach receipt"}
            </Button>
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
            Save entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
