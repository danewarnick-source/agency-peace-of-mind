import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pill, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/emar")({
  head: () => ({ meta: [{ title: "eMAR Pass — Care Academy" }] }),
  component: EmarPage,
});

type DueRow = {
  medication_id: string;
  medication_name: string;
  dosage: string | null;
  route: string | null;
  client_id: string;
  client_name: string;
  scheduled_for: string; // ISO
  time_label: string; // HH:MM
};

const EXCEPTION_REASONS = [
  "Client refused",
  "Client unavailable / sleeping",
  "Held per physician order",
  "NPO (medical hold)",
  "Medication unavailable",
  "Adverse reaction / withheld",
  "Self-administered (witnessed)",
  "Other (see notes)",
];

const ATTESTATION = "I certify under penalty of administrative non-compliance that I have verified the 5 Rights of Medication Administration for this client and that the information logged here is true, accurate, and administered by my hand.";

function EmarPage() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<DueRow | null>(null);

  // Build today's scheduled doses from active meds × scheduled_times
  const { data: rows = [], isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["emar-due", org?.organization_id],
    queryFn: async (): Promise<DueRow[]> => {
      const { data: clients } = await supabase
        .from("clients").select("id, first_name, last_name")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("organization_id", org!.organization_id) as any;
      const clientMap = new Map<string, string>((clients ?? []).map((c: { id: string; first_name: string; last_name: string }) => [c.id, `${c.first_name} ${c.last_name}`]));
      const { data: meds, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_medications" as any)
        .select("id, client_id, medication_name, dosage, route, scheduled_times, is_active")
        .eq("organization_id", org!.organization_id)
        .eq("is_active", true);
      if (error) throw error;

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const out: DueRow[] = [];
      (meds as unknown as Array<{ id: string; client_id: string; medication_name: string; dosage: string | null; route: string | null; scheduled_times: string[] }>).forEach((m) => {
        const name = clientMap.get(m.client_id) || "Unknown";
        (m.scheduled_times ?? []).forEach((t) => {
          const [hh, mm] = t.split(":").map(Number);
          if (isNaN(hh)) return;
          const sched = new Date(today); sched.setHours(hh, mm, 0, 0);
          out.push({
            medication_id: m.id, medication_name: m.medication_name, dosage: m.dosage, route: m.route,
            client_id: m.client_id, client_name: name, scheduled_for: sched.toISOString(), time_label: t,
          });
        });
      });
      return out.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    },
  });

  // Fetch existing logs for today to mark completed
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }, []);
  const todayEnd = useMemo(() => { const d = new Date(); d.setHours(24,0,0,0); return d.toISOString(); }, []);
  const { data: doneLogs = [] } = useQuery({
    enabled: !!org,
    queryKey: ["emar-done-today", org?.organization_id, todayStart],
    queryFn: async () => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("emar_logs" as any)
        .select("medication_id, scheduled_for, status")
        .eq("organization_id", org!.organization_id)
        .gte("scheduled_for", todayStart).lt("scheduled_for", todayEnd);
      return (data ?? []) as Array<{ medication_id: string; scheduled_for: string; status: string }>;
    },
  });
  const doneKey = (r: DueRow) => `${r.medication_id}|${r.scheduled_for}`;
  const doneSet = useMemo(() => new Set(doneLogs.map((l) => `${l.medication_id}|${l.scheduled_for}`)), [doneLogs]);

  const saveMut = useMutation({
    mutationFn: async (payload: {
      row: DueRow; status: "administered" | "refused" | "omitted" | "missed";
      reason: string; notes: string;
    }) => {
      const fullName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Staff";
      const attestation = `${fullName} @ ${new Date().toISOString()} — ${ATTESTATION}`;
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("emar_logs" as any)
        .insert({
          organization_id: org!.organization_id,
          client_id: payload.row.client_id,
          medication_id: payload.row.medication_id,
          scheduled_for: payload.row.scheduled_for,
          scheduled_time_label: payload.row.time_label,
          administered_at: payload.status === "administered" ? new Date().toISOString() : null,
          status: payload.status,
          exception_reason: payload.status === "administered" ? null : payload.reason,
          notes: payload.notes || null,
          staff_id: user!.id,
          staff_name: fullName,
          signature_attestation: attestation,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Medication pass logged");
      qc.invalidateQueries({ queryKey: ["emar-done-today"] });
      qc.invalidateQueries({ queryKey: ["mar-logs"] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Pill className="h-5 w-5 text-primary" /> Electronic Medication Administration
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Today's med-pass schedule. Tap a dose to record administration with 5-Rights attestation.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No medications scheduled.</Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => {
            const done = doneSet.has(doneKey(r));
            return (
              <Card key={`${r.medication_id}-${r.time_label}`}
                className={`flex items-center justify-between gap-3 p-3 ${done ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono">{r.time_label}</Badge>
                  <div>
                    <div className="text-sm font-medium">{r.client_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.medication_name} {r.dosage && `· ${r.dosage}`} {r.route && `· ${r.route}`}
                    </div>
                  </div>
                </div>
                {done ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Logged
                  </Badge>
                ) : (
                  <Button size="sm" onClick={() => setSelected(r)}>Record pass</Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <PassDialog
        row={selected}
        onClose={() => setSelected(null)}
        onSave={(p) => saveMut.mutate(p)}
        pending={saveMut.isPending}
      />
    </div>
  );
}

function PassDialog({
  row, onClose, onSave, pending,
}: {
  row: DueRow | null; onClose: () => void;
  onSave: (p: { row: DueRow; status: "administered" | "refused" | "omitted" | "missed"; reason: string; notes: string }) => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<"administered" | "refused" | "omitted" | "missed">("administered");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [attested, setAttested] = useState(false);

  const isException = status !== "administered";
  const notesRequired = isException && notes.trim().length < 10;
  const reasonRequired = isException && !reason;
  const canSubmit = !!row && attested && !notesRequired && !reasonRequired;

  if (!row) return null;

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record administration</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Card className="p-3 text-sm bg-secondary/40">
            <div className="font-semibold">{row.client_name}</div>
            <div className="text-xs">{row.medication_name} · {row.dosage} · {row.route}</div>
            <div className="text-xs text-muted-foreground">Scheduled {new Date(row.scheduled_for).toLocaleString()}</div>
          </Card>

          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="administered">✅ Administered</SelectItem>
                <SelectItem value="refused">🛑 Refused</SelectItem>
                <SelectItem value="omitted">⚠️ Omitted</SelectItem>
                <SelectItem value="missed">⏰ Missed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isException && (
            <>
              <div className="grid gap-2">
                <Label>Exception reason *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className={reasonRequired ? "border-rose-400" : ""}>
                    <SelectValue placeholder="Select a standardized reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCEPTION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>📋 Detailed Operational Circumstance Notes *</Label>
                <Textarea
                  rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe what happened, the client's affect, attempts made, and any follow-up actions taken."
                  className={notesRequired ? "border-rose-400" : ""}
                />
                {notesRequired && <p className="text-xs text-rose-600">Required — min 10 characters for compliance audit trail.</p>}
              </div>
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Non-administered events trigger a state-level compliance entry. Notify your supervisor per agency policy.</span>
              </div>
            </>
          )}

          {!isException && (
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional observation notes" />
            </div>
          )}

          <label className="flex items-start gap-2 rounded-md border-2 border-primary/30 bg-primary/5 p-3 text-xs cursor-pointer">
            <Checkbox checked={attested} onCheckedChange={(v) => setAttested(v === true)} className="mt-0.5" />
            <span><span className="font-semibold">✍️ Attestation:</span> {ATTESTATION}</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSubmit || pending} onClick={() => onSave({ row, status, reason, notes })}>
            {pending ? "Logging…" : "Sign & submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
