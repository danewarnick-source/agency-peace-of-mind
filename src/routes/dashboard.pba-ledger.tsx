import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Wallet, Plus, ShieldAlert, Receipt, CheckCircle2, Shuffle, Upload, Sparkles, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/pba-ledger")({
  head: () => ({ meta: [{ title: "PBA Trust Ledger — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <PbaLedgerPage />
    </RequirePermission>
  ),
});

type PbaAccount = {
  id: string;
  client_id: string;
  current_balance: number;
  medicaid_threshold: number;
  opened_on: string;
  notes: string | null;
  created_by: string | null;
};
type ClientLite = { id: string; first_name: string; last_name: string };
type AuditSample = { id: string; account_id: string; quarter: string; status: "pending" | "verified"; verified_at: string | null; verifier_notes: string | null; assigned_auditor: string | null };

export function PbaLedgerPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: clients } = useQuery({
    enabled: !!org,
    queryKey: ["pba-clients", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, first_name, last_name")
        .eq("organization_id", org!.organization_id).order("last_name");
      if (error) throw error;
      return (data ?? []) as ClientLite[];
    },
  });

  const { data: accounts } = useQuery({
    enabled: !!org,
    queryKey: ["pba-accounts", org?.organization_id],
    queryFn: async (): Promise<PbaAccount[]> => {
      const { data, error } = await supabase.from("pba_accounts" as never).select("*")
        .eq("organization_id", org!.organization_id).order("opened_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PbaAccount[];
    },
  });

  const { data: samples } = useQuery({
    enabled: !!org,
    queryKey: ["pba-audit-samples", org?.organization_id],
    queryFn: async (): Promise<AuditSample[]> => {
      const qStart = new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("pba_audit_samples" as never).select("*")
        .eq("organization_id", org!.organization_id).eq("quarter", qStart);
      if (error) throw error;
      return (data ?? []) as unknown as AuditSample[];
    },
  });

  const pendingAudits = (samples ?? []).filter((s) => s.status === "pending");
  const auditBlocking = pendingAudits.length > 0;

  const nameOf = (cid: string) => {
    const c = clients?.find((x) => x.id === cid); return c ? `${c.first_name} ${c.last_name}` : "—";
  };

  const [addOpen, setAddOpen] = useState(false);
  const [openAccount, setOpenAccount] = useState<PbaAccount | null>(null);

  const createAcct = useMutation({
    mutationFn: async (input: { client_id: string; threshold: number; notes: string }) => {
      const { error } = await supabase.from("pba_accounts" as never).insert({
        organization_id: org!.organization_id,
        client_id: input.client_id,
        medicaid_threshold: input.threshold,
        notes: input.notes || null,
        created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("PBA account opened"); qc.invalidateQueries({ queryKey: ["pba-accounts"] }); setAddOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenSample = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_pba_audit_sample" as never, { _org: org!.organization_id } as never);
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Quarterly audit sample generated (${n} new account${n === 1 ? "" : "s"})`); qc.invalidateQueries({ queryKey: ["pba-audit-samples"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyMut = useMutation({
    mutationFn: async (args: { sampleId: string; createdBy: string | null; notes: string }) => {
      if (args.createdBy && args.createdBy === user!.id) {
        throw new Error("Independent audit required: the original account owner cannot verify their own ledger.");
      }
      const { error } = await supabase.from("pba_audit_samples" as never).update({
        status: "verified", verified_at: new Date().toISOString(), assigned_auditor: user!.id, verifier_notes: args.notes,
      } as never).eq("id", args.sampleId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Audit verified"); qc.invalidateQueries({ queryKey: ["pba-audit-samples"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">💼 PBA Trust & Fiduciary Ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">Section 1.28 & Article 15 — deposits, withdrawals, receipts, and quarterly 10% independent audit.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> Open PBA account</Button></DialogTrigger>
          <OpenAccountDialog clients={clients ?? []} onSave={(v) => createAcct.mutate(v)} pending={createAcct.isPending} />
        </Dialog>
      </div>

      {auditBlocking && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-700 dark:text-red-300">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">⛔ Quarterly PBA Audit Block Active</p>
            <p className="mt-1 text-sm">{pendingAudits.length} account{pendingAudits.length === 1 ? "" : "s"} in this quarter's 10% sample require independent administrative verification. New write operations remain permitted, but unresolved samples will be reported until cleared.</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-semibold">PBA accounts</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Client</TableHead><TableHead>Balance</TableHead><TableHead>Threshold</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {!accounts?.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No PBA accounts yet.</TableCell></TableRow>}
            {accounts?.map((a) => {
              const bal = Number(a.current_balance), thr = Number(a.medicaid_threshold);
              const ratio = thr > 0 ? bal / thr : 0;
              const tone = ratio >= 0.9 ? "red" : ratio >= 0.75 ? "amber" : "emerald";
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{nameOf(a.client_id)}</TableCell>
                  <TableCell className="font-mono">${bal.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">${thr.toFixed(2)}</TableCell>
                  <TableCell>
                    {tone === "red" && <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">⚠ Approaching Medicaid limit</Badge>}
                    {tone === "amber" && <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">Watch</Badge>}
                    {tone === "emerald" && <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Healthy</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpenAccount(a)}>Open ledger</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div>
            <h3 className="text-sm font-semibold">🎯 Quarterly Independent Audit Sample (10%)</h3>
            <p className="text-[11px] text-muted-foreground">Article 15 — random sampling. Original account owner cannot verify.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => regenSample.mutate()} disabled={regenSample.isPending}>
            <Shuffle className="mr-1.5 h-3.5 w-3.5" /> {regenSample.isPending ? "Picking…" : "Regenerate this quarter's sample"}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Client</TableHead><TableHead>Status</TableHead><TableHead>Verified at</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {!samples?.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No sample picked for this quarter yet.</TableCell></TableRow>}
            {samples?.map((s) => {
              const acct = accounts?.find((a) => a.id === s.account_id);
              return (
                <TableRow key={s.id}>
                  <TableCell>{acct ? nameOf(acct.client_id) : "—"}</TableCell>
                  <TableCell>
                    {s.status === "pending"
                      ? <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">Pending</Badge>
                      : <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Verified</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.verified_at ? new Date(s.verified_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    {s.status === "pending" && (
                      <VerifyButton onConfirm={(notes) => verifyMut.mutate({ sampleId: s.id, createdBy: acct?.created_by ?? null, notes })} pending={verifyMut.isPending} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!openAccount} onOpenChange={(o) => !o && setOpenAccount(null)}>
        {openAccount && <AccountLedgerDialog account={openAccount} clientName={nameOf(openAccount.client_id)} />}
      </Dialog>
    </div>
  );
}

function VerifyButton({ onConfirm, pending }: { onConfirm: (notes: string) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Verify independently</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Independent audit verification</DialogTitle></DialogHeader>
        <div className="grid gap-2">
          <Label>Verification notes</Label>
          <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Reconciliation findings, balance confirmed, receipts cross-checked…" />
          <p className="text-[11px] text-muted-foreground">You will be blocked if you originally opened this account.</p>
        </div>
        <DialogFooter>
          <Button onClick={() => { onConfirm(notes); setOpen(false); }} disabled={!notes.trim() || pending}>{pending ? "Verifying…" : "Confirm verification"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpenAccountDialog({ clients, onSave, pending }: { clients: ClientLite[]; onSave: (v: { client_id: string; threshold: number; notes: string }) => void; pending: boolean }) {
  const [client, setClient] = useState(""); const [threshold, setThreshold] = useState("2000"); const [notes, setNotes] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Open new PBA account</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1.5"><Label>Client</Label>
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger><SelectValue placeholder="Choose client" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5"><Label>Medicaid threshold (USD)</Label><Input type="number" min="0" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSave({ client_id: client, threshold: Number(threshold), notes })} disabled={!client || pending}>{pending ? "Saving…" : "Open account"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

type PbaTx = { id: string; txn_type: string; amount: number; occurred_on: string; memo: string | null; receipt_url: string | null; counterparty: string | null };

function AccountLedgerDialog({ account, clientName }: { account: PbaAccount; clientName: string }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: txs } = useQuery({
    enabled: !!org,
    queryKey: ["pba-tx", account.id],
    queryFn: async (): Promise<PbaTx[]> => {
      const { data, error } = await supabase.from("pba_transactions" as never).select("*")
        .eq("account_id", account.id).order("occurred_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PbaTx[];
    },
  });

  const [type, setType] = useState("withdrawal");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptPreview, setReceiptPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [autofilled, setAutofilled] = useState<{ amount?: boolean; counterparty?: boolean; date?: boolean }>({});
  const [flashGreen, setFlashGreen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const needsReceipt = Number(amount) > 50;

  const flagAutoFilled = (next: { amount?: boolean; counterparty?: boolean; date?: boolean }, green = false) => {
    setAutofilled(next);
    if (green) { setFlashGreen(true); setTimeout(() => setFlashGreen(false), 1800); }
    setTimeout(() => setAutofilled({}), 6000);
  };

  const runParse = async (storagePath: string) => {
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-receipt-ocr", {
        body: { bucket: "client_receipt_snapshots", path: storagePath },
      });
      if (error) throw error;
      const d = data as { merchant_name?: string; total_amount?: number; transaction_date?: string; error?: string };
      if (d?.error) throw new Error(d.error);
      if (d?.total_amount != null) setAmount(String(d.total_amount));
      if (d?.merchant_name) setCounterparty(d.merchant_name);
      if (d?.transaction_date) setDate(d.transaction_date);
      flagAutoFilled({ amount: d?.total_amount != null, counterparty: !!d?.merchant_name, date: !!d?.transaction_date });
      toast.success("NECTAR extracted receipt details");
    } catch (e) {
      toast.error(`NECTAR parsing failed: ${(e as Error).message}`);
    } finally {
      setParsing(false);
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setReceiptPreview(URL.createObjectURL(file));
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${org!.organization_id}/${account.client_id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("client_receipt_snapshots").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      setReceiptUrl(path);
      await runParse(path);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const addTx = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pba_transactions" as never).insert({
        organization_id: org!.organization_id,
        account_id: account.id,
        txn_type: type,
        amount: Number(amount),
        occurred_on: date,
        memo: memo || null,
        counterparty: counterparty || null,
        receipt_url: receiptUrl || null,
        created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction recorded");
      qc.invalidateQueries({ queryKey: ["pba-tx"] });
      qc.invalidateQueries({ queryKey: ["pba-accounts"] });
      setAmount(""); setMemo(""); setCounterparty(""); setReceiptUrl(""); setReceiptPreview(""); setAutofilled({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balance = useMemo(() => Number(account.current_balance), [account]);
  const ratio = balance / Number(account.medicaid_threshold || 1);

  const hl = (on?: boolean) =>
    cn(
      "transition-colors",
      on && (flashGreen
        ? "border-emerald-500/70 ring-2 ring-emerald-500/20"
        : "border-sky-500/60 ring-2 ring-sky-500/20")
    );

  return (
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> {clientName} — PBA Ledger</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Current balance" value={`$${balance.toFixed(2)}`} />
        <Stat label="Medicaid threshold" value={`$${Number(account.medicaid_threshold).toFixed(2)}`} />
        <Stat label="Headroom" value={`${Math.max(0, Math.round((1 - ratio) * 100))}%`} tone={ratio >= 0.9 ? "red" : ratio >= 0.75 ? "amber" : "emerald"} />
      </div>

      <div className="relative rounded-lg border border-border p-4">
        {parsing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-700 dark:text-sky-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              NECTAR is reading receipt telemetry and parsing data…
            </div>
          </div>
        )}

        <h4 className="text-sm font-semibold">New transaction</h4>

        {/* Drop-zone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f);
          }}
          className={cn(
            "mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center transition-colors",
            dragOver ? "border-sky-500 bg-sky-500/10" : "border-border bg-muted/30 hover:bg-muted/50"
          )}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,application/pdf"
            className="hidden"
            disabled={uploading || parsing}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
          <div className="flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4 text-sky-600" />
            📸 Upload or Drag Receipt Snapshot (Auto-Extract Details)
          </div>
          <p className="text-[11px] text-muted-foreground">PNG · JPG · PDF — uploads to secure receipt vault then runs NECTAR vision OCR</p>
          {uploading && <p className="text-[11px] text-sky-600">Uploading securely…</p>}
        </label>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="grid gap-1.5"><Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="withdrawal">Withdrawal</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
                <SelectItem value="interest">Interest</SelectItem>
                <SelectItem value="debt">Outstanding debt</SelectItem>
                <SelectItem value="split_cost">Split-cost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">Amount {autofilled.amount && <AutoBadge green={flashGreen} />}</Label>
            <Input className={hl(autofilled.amount)} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">Date {autofilled.date && <AutoBadge green={flashGreen} />}</Label>
            <Input className={hl(autofilled.date)} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1.5">Location / Description {autofilled.counterparty && <AutoBadge green={flashGreen} />}</Label>
            <Input className={hl(autofilled.counterparty)} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={120} />
          </div>
          <div className="grid gap-1.5 md:col-span-4"><Label>Memo</Label><Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} /></div>
          {needsReceipt && !receiptUrl && (
            <div className="md:col-span-4 grid gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <Label className="flex items-center gap-1.5 text-xs"><Receipt className="h-3.5 w-3.5" /> Receipt required (amount over $50) — use the drop-zone above</Label>
            </div>
          )}
          {receiptPreview && (
            <div className="md:col-span-4 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
              <img src={receiptPreview} alt="Receipt preview" className="h-28 w-28 rounded border border-border object-cover" />
              <div className="flex-1 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Captured snapshot</p>
                <p className="mt-1">Verify the extracted fields above match this receipt before logging the transaction.</p>
                {receiptUrl && <Badge variant="outline" className="mt-2 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"><Upload className="mr-1 h-3 w-3" /> Stored in secure vault</Badge>}
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => addTx.mutate()} disabled={!amount || addTx.isPending || (needsReceipt && !receiptUrl)}>
            {addTx.isPending ? "Saving…" : "Confirm & Log Transaction"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Memo</TableHead><TableHead>Receipt</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {!txs?.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No transactions.</TableCell></TableRow>}
            {txs?.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.occurred_on}</TableCell>
                <TableCell><Badge variant="outline" className="font-mono text-[10px] uppercase">{t.txn_type}</Badge></TableCell>
                <TableCell className="font-mono">${Number(t.amount).toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.memo || "—"}</TableCell>
                <TableCell>{t.receipt_url ? <a href={t.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">View</a> : <span className="text-[11px] text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DialogContent>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" | "amber" | "emerald" }) {
  const cls = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : tone === "emerald" ? "text-emerald-600" : "";
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${cls}`}>{value}</p>
    </div>
  );
}

function AutoBadge({ green }: { green?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
        green
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
      )}
    >
      <Sparkles className="h-2.5 w-2.5" /> Auto-filled by NECTAR
    </span>
  );
}


