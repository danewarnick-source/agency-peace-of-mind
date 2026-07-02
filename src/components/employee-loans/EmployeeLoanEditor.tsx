import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, FileDown, Save, MailCheck, Lock, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  addEmployeeLoanEntry,
  computeRunningBalance,
  deleteEmployeeLoan,
  deleteEmployeeLoanEntry,
  getEmployeeLoan,
  upsertEmployeeLoan,
  voidEmployeeLoanSignatureToken,
  type EmployeeLoanInput,
} from "@/lib/employee-loans.functions";
import { downloadEmployeeLoanPdf } from "@/lib/employee-loan-pdf";
import { SendForSignatureDialog } from "./SendForSignatureDialog";

function uid() { return Math.random().toString(36).slice(2, 10); }

const empty = (organization_id: string, staff_id: string, lender_name: string, borrower_name: string, borrower_email: string | null): EmployeeLoanInput => ({
  organization_id,
  staff_id,
  borrower_name,
  borrower_email,
  lender_name,
  agreement_date: new Date().toISOString().slice(0, 10),
  purpose: "",
  advance_amount: null,
  advance_cadence: "one-time",
  direct_payment_amount: null,
  direct_payment_cadence: "monthly",
  direct_payment_due_day: "",
  direct_payment_start_date: null,
  direct_payment_description: "",
  interest_rate: 0,
  interest_notes: "",
  repayment_conditions: [
    { id: uid(), label: "Deducted from next available paycheck(s) with the Employee's written consent" },
    { id: uid(), label: "In full upon termination of employment (voluntary or involuntary)" },
  ],
  maturity_date: null,
  repayment_method: "",
  voluntary_ack: true,
  signature_parties: [
    { id: uid(), role: "Employee", name: borrower_name, title: "" },
    { id: uid(), role: "Employer", name: lender_name, title: "" },
  ],
  notes: "",
  status: "draft",
});

export function EmployeeLoanEditor({
  organizationId, staffId, loanId, defaultBorrower, defaultBorrowerEmail, defaultLender, onClose,
}: {
  organizationId: string;
  staffId: string;
  loanId?: string;
  defaultBorrower: string;
  defaultBorrowerEmail: string | null;
  defaultLender: string;
  onClose: () => void;
}) {
  const fetchLoan = useServerFn(getEmployeeLoan);
  const saveLoan = useServerFn(upsertEmployeeLoan);
  const removeLoan = useServerFn(deleteEmployeeLoan);
  const addEntry = useServerFn(addEmployeeLoanEntry);
  const removeEntry = useServerFn(deleteEmployeeLoanEntry);
  const voidToken = useServerFn(voidEmployeeLoanSignatureToken);
  const qc = useQueryClient();
  const [sendOpen, setSendOpen] = useState(false);

  const q = useQuery({
    enabled: !!loanId,
    queryKey: ["employee-loan", organizationId, loanId],
    queryFn: () => fetchLoan({ data: { organization_id: organizationId, loan_id: loanId! } }),
  });

  const [values, setValues] = useState<EmployeeLoanInput>(() =>
    empty(organizationId, staffId, defaultLender, defaultBorrower, defaultBorrowerEmail),
  );

  useEffect(() => {
    if (q.data?.loan) {
      const l = q.data.loan;
      setValues({
        organization_id: organizationId,
        staff_id: staffId,
        borrower_name: l.borrower_name,
        borrower_email: l.borrower_email ?? null,
        lender_name: l.lender_name,
        agreement_date: l.agreement_date,
        purpose: l.purpose ?? "",
        advance_amount: l.advance_amount ?? null,
        advance_cadence: l.advance_cadence ?? "one-time",
        direct_payment_amount: l.direct_payment_amount ?? null,
        direct_payment_cadence: l.direct_payment_cadence ?? "monthly",
        direct_payment_due_day: l.direct_payment_due_day ?? "",
        direct_payment_start_date: l.direct_payment_start_date ?? null,
        direct_payment_description: l.direct_payment_description ?? "",
        interest_rate: l.interest_rate ?? 0,
        interest_notes: l.interest_notes ?? "",
        repayment_conditions: Array.isArray(l.repayment_conditions) ? l.repayment_conditions : [],
        maturity_date: l.maturity_date ?? null,
        repayment_method: l.repayment_method ?? "",
        voluntary_ack: !!l.voluntary_ack,
        signature_parties: Array.isArray(l.signature_parties) ? l.signature_parties : [],
        notes: l.notes ?? "",
        status: l.status ?? "draft",
      });
    }
  }, [q.data, organizationId, staffId]);

  const balance = useMemo(() => computeRunningBalance(q.data?.entries ?? []), [q.data?.entries]);
  const signature = (q.data?.signatures ?? [])[0];
  const isLocked = values.status === "signed" || values.status === "active";
  const pendingToken = (q.data?.tokens ?? []).find((t: any) => !t.used_at && new Date(t.expires_at).getTime() > Date.now());

  const saveMut = useMutation({
    mutationFn: () => saveLoan({ data: { id: loanId, values } }),
    onSuccess: (row: any) => {
      toast.success("Loan saved");
      qc.invalidateQueries({ queryKey: ["employee-loans", organizationId] });
      if (!loanId && row?.id) onClose();
      else qc.invalidateQueries({ queryKey: ["employee-loan", organizationId, loanId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const delMut = useMutation({
    mutationFn: () => removeLoan({ data: { organization_id: organizationId, loan_id: loanId! } }),
    onSuccess: () => { toast.success("Loan deleted"); qc.invalidateQueries({ queryKey: ["employee-loans", organizationId] }); onClose(); },
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => voidToken({ data: { organization_id: organizationId, token_id: id } }),
    onSuccess: () => { toast.success("Signing link voided"); qc.invalidateQueries({ queryKey: ["employee-loan", organizationId, loanId] }); },
  });

  const handleDownload = () => {
    downloadEmployeeLoanPdf(
      {
        ...values,
        repayment_conditions: values.repayment_conditions ?? [],
        signature_parties: values.signature_parties ?? [],
        running_balance: balance,
        signed: signature ? {
          signer_name: signature.signer_name,
          signature_image: signature.signature_image,
          signed_at: signature.signed_at,
          signer_ip: signature.signer_ip,
          signature_method: signature.signature_method,
        } : null,
      },
      `employee-loan-${values.borrower_name.replace(/\s+/g, "-").toLowerCase()}.pdf`,
    );
  };

  const [entry, setEntry] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    kind: "advance" as "advance" | "direct_payment" | "repayment" | "adjustment",
    amount: 0,
    note: "",
  });
  const addEntryMut = useMutation({
    mutationFn: () => addEntry({ data: { organization_id: organizationId, loan_id: loanId!, ...entry } }),
    onSuccess: () => { setEntry({ ...entry, amount: 0, note: "" }); qc.invalidateQueries({ queryKey: ["employee-loan", organizationId, loanId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Could not add entry"),
  });
  const delEntryMut = useMutation({
    mutationFn: (id: string) => removeEntry({ data: { organization_id: organizationId, entry_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-loan", organizationId, loanId] }),
  });

  const upd = <K extends keyof EmployeeLoanInput>(k: K, v: EmployeeLoanInput[K]) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{loanId ? "Employee Loan Agreement" : "New Employee Loan Agreement"}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>DRAFT — pending legal review</span>
            {isLocked && (
              <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> Locked (signed)</Badge>
            )}
            {signature && (
              <Badge className="gap-1 bg-emerald-600 text-white"><ShieldCheck className="h-3 w-3" /> Signed by {signature.signer_name}</Badge>
            )}
            {pendingToken && (
              <Badge variant="outline" className="gap-1"><MailCheck className="h-3 w-3" /> Awaiting signature ({pendingToken.signer_email})</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant="outline" onClick={handleDownload}>
            <FileDown className="mr-2 h-4 w-4" /> Download PDF
          </Button>
          {loanId && !isLocked && (
            <Button variant="default" onClick={() => setSendOpen(true)} disabled={!values.borrower_email}>
              <MailCheck className="mr-2 h-4 w-4" /> Send for e-signature
            </Button>
          )}
          {!isLocked && (
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              <Save className="mr-2 h-4 w-4" /> {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          )}
          {loanId && (
            <Button variant="destructive" onClick={() => { if (confirm("Delete this agreement and ledger?")) delMut.mutate(); }}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      {pendingToken && !isLocked && (
        <Card className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>Signing link sent to <b>{pendingToken.signer_email}</b> — expires {new Date(pendingToken.expires_at).toLocaleString()}.</span>
            <Button size="sm" variant="outline" onClick={() => voidMut.mutate(pendingToken.id)}>Void link</Button>
          </CardContent>
        </Card>
      )}

      <fieldset disabled={isLocked} className="space-y-6 disabled:opacity-80">
        <Card>
          <CardHeader><CardTitle className="text-base">Parties &amp; Date</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Employee (borrower)</Label>
              <Input value={values.borrower_name} onChange={(e) => upd("borrower_name", e.target.value)} />
            </div>
            <div>
              <Label>Employee email (for e-signature)</Label>
              <Input type="email" value={values.borrower_email ?? ""} onChange={(e) => upd("borrower_email", e.target.value || null)} />
            </div>
            <div>
              <Label>Employer (lender)</Label>
              <Input value={values.lender_name} onChange={(e) => upd("lender_name", e.target.value)} />
            </div>
            <div>
              <Label>Agreement date</Label>
              <Input type="date" value={values.agreement_date} onChange={(e) => upd("agreement_date", e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <Label>Purpose / description</Label>
              <Textarea rows={2} value={values.purpose ?? ""} onChange={(e) => upd("purpose", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Advance terms</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Advance amount ($)</Label>
              <Input type="number" step="0.01" value={values.advance_amount ?? ""} onChange={(e) => upd("advance_amount", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <div>
              <Label>Cadence</Label>
              <Select value={values.advance_cadence ?? "one-time"} onValueChange={(v) => upd("advance_cadence", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one-time">One-time</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recurring direct payment (optional)</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" value={values.direct_payment_amount ?? ""} onChange={(e) => upd("direct_payment_amount", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <div>
              <Label>Cadence</Label>
              <Select value={values.direct_payment_cadence ?? "monthly"} onValueChange={(v) => upd("direct_payment_cadence", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due day / detail</Label>
              <Input value={values.direct_payment_due_day ?? ""} onChange={(e) => upd("direct_payment_due_day", e.target.value)} placeholder="1st of each month" />
            </div>
            <div>
              <Label>Start date</Label>
              <Input type="date" value={values.direct_payment_start_date ?? ""} onChange={(e) => upd("direct_payment_start_date", e.target.value || null)} />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Input value={values.direct_payment_description ?? ""} onChange={(e) => upd("direct_payment_description", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Interest</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Interest rate (% / year)</Label>
              <Input type="number" step="0.001" value={values.interest_rate} onChange={(e) => upd("interest_rate", Number(e.target.value) || 0)} />
              <p className="mt-1 text-[11px] text-muted-foreground">Leave 0 for interest-free.</p>
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Input value={values.interest_notes ?? ""} onChange={(e) => upd("interest_notes", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Repayment terms</span>
              <Button size="sm" variant="outline" onClick={() => upd("repayment_conditions", [...values.repayment_conditions, { id: uid(), label: "" }])}>
                <Plus className="mr-1 h-3 w-3" /> Add condition
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {values.repayment_conditions.map((c, i) => (
              <div key={c.id} className="flex gap-2">
                <Input value={c.label} onChange={(e) => {
                  const next = [...values.repayment_conditions];
                  next[i] = { ...c, label: e.target.value };
                  upd("repayment_conditions", next);
                }} />
                <Button size="icon" variant="ghost" onClick={() => upd("repayment_conditions", values.repayment_conditions.filter((x) => x.id !== c.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Maturity date (final due date)</Label>
                <Input type="date" value={values.maturity_date ?? ""} onChange={(e) => upd("maturity_date", e.target.value || null)} />
              </div>
              <div>
                <Label>Method of repayment</Label>
                <Input value={values.repayment_method ?? ""} onChange={(e) => upd("repayment_method", e.target.value)} placeholder="Payroll deduction / direct deposit / check" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Acknowledgments</CardTitle></CardHeader>
          <CardContent>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={values.voluntary_ack} onCheckedChange={(c) => upd("voluntary_ack", !!c)} className="mt-0.5" />
              <span>Employee's decision to accept or decline this loan will not affect, in any way, their employment status or benefits.</span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Signature parties</span>
              <Button size="sm" variant="outline" onClick={() => upd("signature_parties", [...values.signature_parties, { id: uid(), role: "Witness", name: "", title: "" }])}>
                <Plus className="mr-1 h-3 w-3" /> Add party
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {values.signature_parties.map((p, i) => (
              <div key={p.id} className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <Input value={p.role} onChange={(e) => { const next = [...values.signature_parties]; next[i] = { ...p, role: e.target.value }; upd("signature_parties", next); }} placeholder="Role" />
                <Input value={p.name} onChange={(e) => { const next = [...values.signature_parties]; next[i] = { ...p, name: e.target.value }; upd("signature_parties", next); }} placeholder="Name" />
                <Input value={p.title ?? ""} onChange={(e) => { const next = [...values.signature_parties]; next[i] = { ...p, title: e.target.value }; upd("signature_parties", next); }} placeholder="Title (optional)" />
                <Button variant="ghost" size="icon" onClick={() => upd("signature_parties", values.signature_parties.filter((x) => x.id !== p.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </fieldset>

      {signature && (
        <Card className="border-emerald-300/60 bg-emerald-50/30 dark:bg-emerald-900/10">
          <CardHeader><CardTitle className="text-base">Electronic signature on file</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="space-y-1">
              <div><b>Signer:</b> {signature.signer_name}</div>
              <div><b>Email:</b> {signature.signer_email ?? "—"}</div>
              <div><b>Method:</b> {signature.signature_method}</div>
              <div><b>Signed at:</b> {new Date(signature.signed_at).toLocaleString()}</div>
              <div><b>IP:</b> <span className="font-mono text-xs">{signature.signer_ip ?? "—"}</span></div>
            </div>
            <div>
              <img src={signature.signature_image} alt="signature" className="max-h-24 rounded border border-border bg-white p-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {loanId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>Loan Ledger</span>
              <span className="rounded bg-muted px-2 py-0.5 text-sm font-mono">Running balance: ${balance.toFixed(2)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <Input type="date" value={entry.entry_date} onChange={(e) => setEntry({ ...entry, entry_date: e.target.value })} />
              <Select value={entry.kind} onValueChange={(v: any) => setEntry({ ...entry, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="direct_payment">Direct payment</SelectItem>
                  <SelectItem value="repayment">Repayment</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" step="0.01" placeholder="Amount" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: Number(e.target.value) || 0 })} />
              <Input placeholder="Note" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} />
              <Button onClick={() => addEntryMut.mutate()} disabled={!entry.amount || addEntryMut.isPending}>
                <Plus className="mr-1 h-4 w-4" /> Add entry
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.entries ?? []).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.entry_date}</TableCell>
                    <TableCell className="capitalize">{e.kind.replace("_", " ")}</TableCell>
                    <TableCell className="text-right font-mono">${Number(e.amount).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.note}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => delEntryMut.mutate(e.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!(q.data?.entries ?? []).length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground">No entries yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Internal notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={values.notes ?? ""} onChange={(e) => upd("notes", e.target.value)} disabled={isLocked} />
        </CardContent>
      </Card>

      {loanId && (
        <SendForSignatureDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          organizationId={organizationId}
          loanId={loanId}
          defaultEmail={values.borrower_email ?? ""}
          defaultName={values.borrower_name}
        />
      )}
    </div>
  );
}
