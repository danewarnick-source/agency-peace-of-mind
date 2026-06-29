import { useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useClientBudget } from "@/hooks/use-client-budget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Pencil,
  Check,
  X,
  ExternalLink,
  IdCard,
  CalendarRange,
  Receipt,
  AlertTriangle,
  Upload,
  Sparkles,
  FileText,
} from "lucide-react";
import { isDailyServiceCode } from "@/lib/service-billing";
import { isVariableRateCode } from "@/lib/variable-rate-codes";
import {
  parseClientBudgetDocument,
  type ParsedBudget,
  type ParsedBudgetRow,
} from "@/lib/billing-budget-parse.functions";
import { getAuthStatus, AuthStatusBadge } from "@/lib/billing-auth-status";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  clientId: string;
  clientName: string;
  medicaidId: string | null;
};

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export function BillingCodesDetail({ clientId, clientName, medicaidId }: Props) {
  const { data: budgets, isLoading } = useClientBudget(clientId);

  const planYear = useMemo(() => {
    if (!budgets || budgets.length === 0) return { start: null as Date | null, end: null as Date | null };
    let start: Date | null = null;
    let end: Date | null = null;
    for (const b of budgets) {
      if (b.period_start && (!start || b.period_start < start)) start = b.period_start;
      if (b.period_end && (!end || b.period_end > end)) end = b.period_end;
    }
    return { start, end };
  }, [budgets]);

  return (
    <Card className="border-amber-500/20 bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Billing Codes Detail
            </CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Live unit ledger per authorized DSPD code. Used units pull from EVV punches and daily logs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Per-section budget upload removed — use NECTAR Bulk Import (AI PDF mode) to populate authorized billing codes from a PCSP. */}
            <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
              <Link to="/dashboard/billing/$clientId" params={{ clientId }}>
                <ExternalLink className="h-3.5 w-3.5" /> Full billing editor
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field icon={<IdCard className="h-3.5 w-3.5" />} label="Client">
              <span className="font-semibold">{clientName}</span>
            </Field>
            <Field icon={<Receipt className="h-3.5 w-3.5" />} label="Individual Medicaid ID">
              <span className="font-mono">{medicaidId || "—"}</span>
            </Field>
            <Field icon={<CalendarRange className="h-3.5 w-3.5" />} label="Plan Year Renewal">
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {fmtDate(planYear.start)} – {fmtDate(planYear.end)}
              </span>
            </Field>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !budgets || budgets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background/40 p-6 text-center">
            <p className="text-sm font-medium">No authorized billing codes yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Add codes via the multi-select above, then open the full billing editor to set annual units, rates, and the plan year window.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3 gap-1.5 text-xs">
              <Link to="/dashboard/billing/$clientId" params={{ clientId }}>
                <ExternalLink className="h-3.5 w-3.5" /> Open billing editor
              </Link>
            </Button>
          </div>
        ) : (
          (() => {
            const current = budgets.filter(
              (b) =>
                getAuthStatus(b.code.service_start_date, b.code.service_end_date) !== "expired",
            );
            const previous = budgets.filter(
              (b) =>
                getAuthStatus(b.code.service_start_date, b.code.service_end_date) === "expired",
            );
            return (
              <div className="space-y-4">
                <div className="space-y-3">
                  {current.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-center text-xs text-muted-foreground">
                      No active authorizations. See Previous authorizations below.
                    </div>
                  )}
                  {current.map((b) => (
                    <CodeRow key={b.code.id} clientId={clientId} budget={b} />
                  ))}
                </div>
                {previous.length > 0 && <PreviousAuthorizations clientId={clientId} budgets={previous} />}
              </div>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

// ─── Upload + Parse 1056 / PCSP ─────────────────────────────────────────────

type ApplyRow = ParsedBudgetRow & { apply: boolean };

function BudgetUploadButton({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const parseFn = useServerFn(parseClientBudgetDocument);

  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<ParsedBudget | null>(null);
  const [rows, setRows] = useState<ApplyRow[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [docType, setDocType] = useState<"PCSP" | "1056">("PCSP");

  async function handleFile(file: File) {
    if (!org?.organization_id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${org.organization_id}/${clientId}/budget-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      // Bucket is private + org-scoped; store a stable reference and use
      // signed URLs at read time.
      const fileUrlRef = `storage://client-documents/${path}`;
      const { data: insertData, error: insErr } = await (supabase as any)
        .from("client_documents")
        .insert({
          client_id: clientId,
          organization_id: org.organization_id,
          file_name: file.name,
          document_type: docType,
          file_url: fileUrlRef,
          storage_path: path,
          file_size_bytes: file.size,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      setDocId(insertData.id);

      setUploading(false);
      setParsing(true);
      toast.message("NECTAR is reading the form…", { description: "Extracting the Plan Budget table." });
      const parsed = await parseFn({
        data: { storagePath: path, mimeType: file.type || "application/pdf" },
      });
      setPreview(parsed);
      setRows(parsed.rows.map((r) => ({ ...r, apply: true })));
      if (parsed.rows.length === 0) {
        toast.warning("NECTAR couldn't find a Plan Budget table in that document.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload or parsing failed.");
    } finally {
      setUploading(false);
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleApply() {
    if (!org?.organization_id || !preview) return;
    const toApply = rows.filter((r) => r.apply);
    if (toApply.length === 0) {
      setPreview(null);
      return;
    }
    setApplying(true);
    try {
      const sourceLabel = preview.plan_number
        ? `from ${preview.source_form === "Unknown" ? docType : preview.source_form}, plan ${preview.plan_number}`
        : `from ${preview.source_form === "Unknown" ? docType : preview.source_form}`;
      const now = new Date().toISOString();

      for (const r of toApply) {
        // Find existing row for this code on this client.
        const { data: existing } = await (supabase as any)
          .from("client_billing_codes")
          .select("id")
          .eq("client_id", clientId)
          .eq("organization_id", org.organization_id)
          .eq("service_code", r.service_code)
          .maybeSingle();

        const payload: Record<string, unknown> = {
          rate_source: sourceLabel,
          rate_source_plan_number: preview.plan_number,
          rate_source_document_id: docId,
          rate_source_at: now,
        };
        if (r.rate_per_unit != null) payload.rate_per_unit = r.rate_per_unit;
        if (r.max_units != null) payload.annual_unit_authorization = r.max_units;
        if (r.start_date) payload.service_start_date = r.start_date;
        if (r.end_date) payload.service_end_date = r.end_date;

        if (existing?.id) {
          await (supabase as any)
            .from("client_billing_codes")
            .update(payload)
            .eq("id", existing.id);
        } else {
          await (supabase as any)
            .from("client_billing_codes")
            .insert({
              client_id: clientId,
              organization_id: org.organization_id,
              service_code: r.service_code,
              unit_type: isDailyServiceCode(r.service_code) ? "day" : "unit",
              ...payload,
            });
        }
      }

      toast.success(`Applied ${toApply.length} code${toApply.length === 1 ? "" : "s"} from the form.`);
      qc.invalidateQueries({ queryKey: ["client-billing-codes"] });
      qc.invalidateQueries({ queryKey: ["all-client-billing-codes"] });
      qc.invalidateQueries({ queryKey: ["client-budget"] });
      qc.invalidateQueries({ queryKey: ["client-docs", clientId] });
      setPreview(null);
      setDocId(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to apply parsed rows.");
    } finally {
      setApplying(false);
    }
  }

  const busy = uploading || parsing;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <div className="flex items-center gap-1">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as "PCSP" | "1056")}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          disabled={busy}
          aria-label="Document type"
        >
          <option value="PCSP">PCSP</option>
          <option value="1056">1056 Budget</option>
        </select>
        <Button
          size="sm"
          variant="default"
          className="gap-1.5 text-xs"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {parsing ? (
            <>
              <Sparkles className="h-3.5 w-3.5 animate-pulse" /> NECTAR reading…
            </>
          ) : uploading ? (
            <>
              <Upload className="h-3.5 w-3.5 animate-pulse" /> Uploading…
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" /> Upload {docType} to auto-fill rates
            </>
          )}
        </Button>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Review extracted Plan Budget
            </DialogTitle>
            <DialogDescription>
              NECTAR parsed{" "}
              <span className="font-medium text-foreground">
                {preview?.source_form === "Unknown" ? docType : preview?.source_form}
              </span>
              {preview?.plan_number && (
                <>
                  {" "}· plan #
                  <span className="font-mono">{preview.plan_number}</span>
                </>
              )}
              . Uncheck any row you don't want applied. Existing codes are updated; new codes are inserted.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Apply</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Max Units</TableHead>
                  <TableHead className="text-right">Units Billed</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={r.apply}
                        onChange={(e) =>
                          setRows((prev) => prev.map((x, j) => (j === i ? { ...x, apply: e.target.checked } : x)))
                        }
                      />
                    </TableCell>
                    <TableCell className="font-mono">
                      {r.service_code}
                      {isVariableRateCode(r.service_code) && (
                        <Badge variant="outline" className="ml-1.5 text-[9px]">Variable</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.rate_per_unit != null ? fmtMoney(r.rate_per_unit) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.max_units ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{r.units_billed ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.start_date ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.end_date ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No rows extracted. You can still enter values manually on each code below.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={applying || rows.every((r) => !r.apply)}>
              {applying ? "Applying…" : `Apply ${rows.filter((r) => r.apply).length} row(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Per-code card ──────────────────────────────────────────────────────────

type Budget = NonNullable<ReturnType<typeof useClientBudget>["data"]>[number];

function PreviousAuthorizations({ clientId, budgets }: { clientId: string; budgets: Budget[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Previous authorizations ({budgets.length})
        </span>
        <span className="text-[10px] font-normal normal-case text-muted-foreground">
          Retained for Medicaid records — read-only
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          {budgets.map((b) => (
            <CodeRow key={b.code.id} clientId={clientId} budget={b} readOnly />
          ))}
        </div>
      )}
    </div>
  );
}

function CodeRow({ clientId: _clientId, budget, readOnly = false }: { clientId: string; budget: Budget; readOnly?: boolean }) {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const code = budget.code as Budget["code"] & {
    rate_source?: string | null;
    rate_source_plan_number?: string | null;
  };
  const isDaily = isDailyServiceCode(code.service_code);
  const isVariable = isVariableRateCode(code.service_code);
  const status = getAuthStatus(code.service_start_date, code.service_end_date);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annual, setAnnual] = useState<string>(String(code.annual_unit_authorization ?? 0));
  const [rate, setRate] = useState<string>(String(code.rate_per_unit ?? 0));
  const [endDateDraft, setEndDateDraft] = useState<string>("");
  const [savingEnd, setSavingEnd] = useState(false);


  const usedUnits = budget.used_units;
  const annualUnits = code.annual_unit_authorization ?? 0;
  const rateNum = Number(code.rate_per_unit ?? 0);
  const remainingUnits = Math.max(0, annualUnits - usedUnits);
  const totalBilled = usedUnits * rateNum;
  const remainingBudget = remainingUnits * rateNum;
  const pct = annualUnits > 0 ? Math.min(100, (usedUnits / annualUnits) * 100) : 0;

  const exhausted = annualUnits > 0 && usedUnits >= annualUnits;
  const isEmpty = usedUnits === 0;

  async function handleSave() {
    if (!org?.organization_id) return;
    const a = Number(annual);
    const r = Number(rate);
    if (!isFinite(a) || a < 0) return toast.error("Annual units must be a non-negative number");
    if (!isFinite(r) || r < 0) return toast.error("Rate must be a non-negative number");
    setSaving(true);
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("client_billing_codes" as any)
      .update({
        annual_unit_authorization: a,
        rate_per_unit: r,
        // Manual override clears the source attribution.
        rate_source: "Manual override",
        rate_source_plan_number: null,
        rate_source_document_id: null,
        rate_source_at: new Date().toISOString(),
      })
      .eq("id", code.id)
      .eq("organization_id", org.organization_id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${code.service_code} updated`);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["all-client-billing-codes"] });
    qc.invalidateQueries({ queryKey: ["client-billing-codes"] });
    qc.invalidateQueries({ queryKey: ["client-budget"] });
  }

  function handleCancel() {
    setAnnual(String(code.annual_unit_authorization ?? 0));
    setRate(String(code.rate_per_unit ?? 0));
    setEditing(false);
  }

  const unitLabel = isDaily ? "days" : "units";

  return (
    <div className="rounded-xl border border-border bg-background/60 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Badge className="bg-primary/10 font-mono text-primary hover:bg-primary/10">{code.service_code}</Badge>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {isDaily ? "Daily code" : "Hourly code · 1 hr = 4 units"}
          </span>
          {isVariable && (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
              Variable rate · client-specific
            </Badge>
          )}
          {isVariable && rateNum <= 0 && (
            <Badge variant="outline" className="gap-1 border-amber-500/60 bg-amber-500/15 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" /> No worksheet rate on file
            </Badge>
          )}
          {exhausted && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <AlertTriangle className="h-3 w-3" /> Authorization exhausted
            </Badge>
          )}
          {!exhausted && isEmpty && (
            <Badge variant="outline" className="text-[10px]">No usage logged yet</Badge>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving} className="h-7 gap-1 text-xs">
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 gap-1 text-xs">
              <Check className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-7 gap-1 text-xs">
            <Pencil className="h-3.5 w-3.5" /> {isVariable ? "Manual override" : "Edit"}
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={`Annual ${unitLabel}`}>
          {editing ? (
            <Input type="number" min={0} value={annual} onChange={(e) => setAnnual(e.target.value)} className="h-8 font-mono text-sm" />
          ) : (
            <span className="font-mono text-sm font-semibold tabular-nums">{annualUnits.toLocaleString()}</span>
          )}
        </Stat>
        <Stat label={`Used ${unitLabel}`}>
          <span className="font-mono text-sm font-semibold tabular-nums">{usedUnits.toLocaleString()}</span>
        </Stat>
        <Stat label={`Remaining ${unitLabel}`}>
          <span className="font-mono text-sm font-semibold tabular-nums">{remainingUnits.toLocaleString()}</span>
        </Stat>
        <Stat label="Rate / unit">
          {editing ? (
            <Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="h-8 font-mono text-sm" />
          ) : (
            <span className="font-mono text-sm font-semibold tabular-nums">{fmtMoney(rateNum)}</span>
          )}
        </Stat>
        <Stat label="Total billed">
          {isVariable && rateNum <= 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" /> no worksheet rate on file
            </span>
          ) : (
            <span className="font-mono text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {fmtMoney(totalBilled)}
            </span>
          )}
        </Stat>
        <Stat label="Remaining budget">
          {isVariable && rateNum <= 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" /> no worksheet rate on file
            </span>
          ) : (
            <span className="font-mono text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {fmtMoney(remainingBudget)}
            </span>
          )}
        </Stat>
      </div>

      {/* Rate source attribution */}
      {code.rate_source && !editing && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          <FileText className="mr-1 inline h-3 w-3" />
          Rate {code.rate_source}
        </p>
      )}
      {!code.rate_source && isVariable && !editing && (
        <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          Variable-rate code — upload this client's PCSP or 1056 form to auto-fill, or enter manually.
        </p>
      )}

      {annualUnits > 0 && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                exhausted ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {pct.toFixed(0)}% of authorization used
            {code.service_start_date && code.service_end_date && (
              <> · plan window {code.service_start_date} → {code.service_end_date}</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
