// Historical timesheets import wizard — spreadsheet-only (CSV/XLSX),
// column-mapping + name-based matching against EXISTING staff and clients.
// Never creates new staff or client records. Anything imported here is
// permanently marked import_source='historical_import' on evv_timesheets.
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Upload, X, Loader2, ArrowRight, ArrowLeft, Download,
  CheckCircle2, AlertTriangle, HelpCircle, Archive,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useCurrentOrg } from "@/hooks/use-org";

import {
  createTimesheetImportJob,
  importHistoricalTimesheets,
} from "@/lib/smart-import-timesheets.functions";

type ParsedFile = { headers: string[]; rows: Record<string, string>[]; fileName: string };

type FieldKey = "staff" | "client" | "date" | "clock_in" | "clock_out" | "notes" | "service_code";

type Mapping = Record<FieldKey, string | null> & {
  singleDateTimeIn: boolean;   // clock_in column already has date+time
  singleDateTimeOut: boolean;  // clock_out column already has date+time
};

type Person = { id: string; label: string; norms: string[] };

type MatchStatus = "matched" | "ambiguous" | "no_match" | "invalid";

type ReviewRow = {
  idx: number;
  raw: Record<string, string>;
  staffLabel: string;
  clientLabel: string;
  dateStr: string;
  clockInStr: string;
  clockOutStr: string;
  notes: string;
  serviceCode: string;
  staffCandidates: Person[];
  clientCandidates: Person[];
  staffId: string | null;   // resolved (chosen) staff
  clientId: string | null;  // resolved (chosen) client
  clockInIso: string | null;
  clockOutIso: string | null;
  status: MatchStatus;
  reason: string | null;
  skipped: boolean;
};

const ALLOWED_EXT = [".csv", ".xlsx", ".xls"];
const MAX_BYTES = 25 * 1024 * 1024;

// ─── parsing ───────────────────────────────────────────────────────────────
async function parseFile(file: File): Promise<ParsedFile> {
  const n = file.name.toLowerCase();
  if (n.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const headers = res.meta.fields ?? [];
    const rows = (res.data ?? []).map((r) => {
      const out: Record<string, string> = {};
      for (const h of headers) out[h] = String(r[h] ?? "").trim();
      return out;
    });
    return { headers, rows, fileName: file.name };
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const headers = json.length ? Object.keys(json[0]) : [];
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      const v = r[h];
      out[h] = v instanceof Date ? v.toISOString() : String(v ?? "").trim();
    }
    return out;
  });
  return { headers, rows, fileName: file.name };
}

// ─── name normalization & matching ─────────────────────────────────────────
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function personNorms(first: string, last: string, full?: string | null): string[] {
  const f = normalize(first || "");
  const l = normalize(last || "");
  const combined = normalize(full || `${first} ${last}`);
  const initials = f && l ? `${f[0]} ${l}` : "";
  const lastFirst = l && f ? `${l} ${f}` : "";
  return Array.from(new Set([combined, `${f} ${l}`.trim(), lastFirst, initials].filter(Boolean)));
}

function findCandidates(pool: Person[], raw: string): Person[] {
  const q = normalize(raw);
  if (!q) return [];
  const exact = pool.filter((p) => p.norms.includes(q));
  if (exact.length > 0) return exact;
  // "last, first" written as "last first" or reversed
  const parts = q.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const reversed = `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`;
    const rev = pool.filter((p) => p.norms.includes(reversed));
    if (rev.length > 0) return rev;
  }
  // last-name only: unique last-word match
  if (parts.length === 1) {
    const last = parts[0];
    const byLast = pool.filter((p) => p.norms.some((n) => n.endsWith(` ${last}`) || n === last));
    if (byLast.length > 0) return byLast;
  }
  // initial + last: "j smith"
  if (parts.length === 2 && parts[0].length === 1) {
    const init = pool.filter((p) => p.norms.includes(`${parts[0]} ${parts[1]}`));
    if (init.length > 0) return init;
  }
  return [];
}

// ─── date/time parsing ─────────────────────────────────────────────────────
function tryParseDateTime(dateStr: string, timeStr: string | null, singleField: boolean): Date | null {
  const combined = singleField || !timeStr ? dateStr : `${dateStr} ${timeStr}`;
  if (!combined) return null;
  // ISO first
  const iso = new Date(combined);
  if (!isNaN(iso.getTime()) && /\d{4}/.test(combined)) return iso;
  // US M/D/YYYY [h:mm[:ss] am/pm]
  const m = combined.match(
    /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|AM|PM)?)?\s*$/,
  );
  if (m) {
    let [, mm, dd, yy, hh = "0", mi = "0", ss = "0", ap] = m;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    let hour = Number(hh);
    if (ap && /pm/i.test(ap) && hour < 12) hour += 12;
    if (ap && /am/i.test(ap) && hour === 12) hour = 0;
    const d = new Date(year, Number(mm) - 1, Number(dd), hour, Number(mi), Number(ss));
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(combined);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// ─── auto-suggest mapping ──────────────────────────────────────────────────
function suggest(headers: string[]): Mapping {
  const find = (patterns: RegExp[]): string | null => {
    for (const h of headers) {
      const n = h.toLowerCase().trim();
      if (patterns.some((p) => p.test(n))) return h;
    }
    return null;
  };
  return {
    staff: find([/\b(staff|employee|worker|caregiver|dsp|provider)\b/]),
    client: find([/\b(client|member|consumer|recipient|individual|participant)\b/]),
    date: find([/\bdate\b/, /\bshift\s*date\b/]),
    clock_in: find([/\b(clock[\s_-]?in|time[\s_-]?in|start|begin)\b/]),
    clock_out: find([/\b(clock[\s_-]?out|time[\s_-]?out|end|finish|stop)\b/]),
    notes: find([/\b(note|comment|memo|description)\b/]),
    service_code: find([/\b(service|code|billing)\b/]),
    singleDateTimeIn: false,
    singleDateTimeOut: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════

export function TimesheetsImportWizard() {
  const { data: org } = useCurrentOrg();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [committed, setCommitted] = useState<{ inserted: number; staffCount: number } | null>(null);

  const createJob = useServerFn(createTimesheetImportJob);
  const commitRows = useServerFn(importHistoricalTimesheets);

  // Load staff + clients for this org (cached)
  const peopleQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["ts-import-people", org?.organization_id],
    queryFn: async () => {
      const [staffRes, clientsRes] = await Promise.all([
        supabase
          .from("organization_members")
          .select("user_id, profiles:profiles!inner(id, first_name, last_name, full_name)")
          .eq("organization_id", org!.organization_id)
          .eq("active", true),
        supabase
          .from("clients")
          .select("id, first_name, last_name")
          .eq("organization_id", org!.organization_id),
      ]);
      if (staffRes.error) throw staffRes.error;
      if (clientsRes.error) throw clientsRes.error;
      type S = { profiles: { id: string; first_name: string | null; last_name: string | null; full_name: string | null } };
      const staff: Person[] = ((staffRes.data ?? []) as unknown as S[])
        .map((m) => m.profiles)
        .filter(Boolean)
        .map((p) => ({
          id: p.id,
          label:
            (p.full_name?.trim()) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            "Staff",
          norms: personNorms(p.first_name ?? "", p.last_name ?? "", p.full_name),
        }));
      const clients: Person[] = ((clientsRes.data ?? []) as Array<{
        id: string; first_name: string; last_name: string;
      }>).map((c) => ({
        id: c.id,
        label: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Client",
        norms: personNorms(c.first_name ?? "", c.last_name ?? ""),
      }));
      return { staff, clients };
    },
  });

  // ── Step 1 handlers ──
  const onPickFile = useCallback(async (f: File) => {
    const okExt = ALLOWED_EXT.some((e) => f.name.toLowerCase().endsWith(e));
    if (!okExt) {
      toast.error("Historical timesheet import only accepts CSV or Excel (.csv, .xlsx, .xls).");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(`${f.name} is larger than 25 MB.`);
      return;
    }
    try {
      const p = await parseFile(f);
      if (p.headers.length === 0 || p.rows.length === 0) {
        toast.error("That file didn't contain any readable rows.");
        return;
      }
      setFile(f);
      setParsed(p);
      setMapping(suggest(p.headers));
      setStep(2);
    } catch (e) {
      toast.error(`Couldn't read ${f.name}: ${(e as Error).message}`);
    }
  }, []);

  // ── Step 3 build ──
  const buildReviewRows = useCallback(() => {
    if (!parsed || !mapping || !peopleQ.data) return;
    const { staff, clients } = peopleQ.data;
    const result: ReviewRow[] = parsed.rows.map((raw, idx) => {
      const staffLabel = mapping.staff ? raw[mapping.staff] ?? "" : "";
      const clientLabel = mapping.client ? raw[mapping.client] ?? "" : "";
      const dateStr = mapping.date ? raw[mapping.date] ?? "" : "";
      const clockInStr = mapping.clock_in ? raw[mapping.clock_in] ?? "" : "";
      const clockOutStr = mapping.clock_out ? raw[mapping.clock_out] ?? "" : "";
      const notes = mapping.notes ? raw[mapping.notes] ?? "" : "";
      const serviceCode = mapping.service_code ? (raw[mapping.service_code] ?? "").toUpperCase() : "";

      const staffCandidates = findCandidates(staff, staffLabel);
      const clientCandidates = findCandidates(clients, clientLabel);

      const inDate = tryParseDateTime(mapping.singleDateTimeIn ? clockInStr : dateStr, clockInStr, mapping.singleDateTimeIn);
      const outDate = tryParseDateTime(mapping.singleDateTimeOut ? clockOutStr : dateStr, clockOutStr, mapping.singleDateTimeOut);

      let status: MatchStatus;
      let reason: string | null = null;
      let staffId: string | null = null;
      let clientId: string | null = null;

      if (!staffLabel || !clientLabel || !dateStr || !clockInStr || !clockOutStr) {
        status = "invalid";
        reason = "missing required cells";
      } else if (!inDate || !outDate) {
        status = "invalid";
        reason = "unreadable date or time";
      } else if (outDate.getTime() <= inDate.getTime()) {
        status = "invalid";
        reason = "clock-out is not after clock-in";
      } else if (staffCandidates.length === 0 || clientCandidates.length === 0) {
        status = "no_match";
        reason =
          staffCandidates.length === 0 && clientCandidates.length === 0
            ? "no staff or client match"
            : staffCandidates.length === 0
              ? "no staff match"
              : "no client match";
      } else if (staffCandidates.length > 1 || clientCandidates.length > 1) {
        status = "ambiguous";
        reason = "multiple possible matches";
      } else {
        status = "matched";
        staffId = staffCandidates[0].id;
        clientId = clientCandidates[0].id;
      }

      return {
        idx,
        raw,
        staffLabel, clientLabel, dateStr, clockInStr, clockOutStr, notes, serviceCode,
        staffCandidates, clientCandidates,
        staffId, clientId,
        clockInIso: inDate ? inDate.toISOString() : null,
        clockOutIso: outDate ? outDate.toISOString() : null,
        status, reason,
        skipped: false,
      };
    });
    setRows(result);
    setStep(3);
  }, [parsed, mapping, peopleQ.data]);

  // Actions on review rows
  const updateRow = (idx: number, patch: Partial<ReviewRow>) => {
    setRows((r) => r.map((row) => (row.idx === idx ? { ...row, ...patch } : row)));
  };

  const chooseStaff = (idx: number, id: string) => {
    const row = rows.find((r) => r.idx === idx);
    if (!row) return;
    const patch: Partial<ReviewRow> = { staffId: id };
    // if client also resolved -> matched
    if (row.clientId && row.clockInIso && row.clockOutIso) {
      patch.status = "matched";
      patch.reason = null;
    }
    updateRow(idx, patch);
  };
  const chooseClient = (idx: number, id: string) => {
    const row = rows.find((r) => r.idx === idx);
    if (!row) return;
    const patch: Partial<ReviewRow> = { clientId: id };
    if (row.staffId && row.clockInIso && row.clockOutIso) {
      patch.status = "matched";
      patch.reason = null;
    }
    updateRow(idx, patch);
  };
  const linkManually = (idx: number, kind: "staff" | "client", id: string) => {
    const row = rows.find((r) => r.idx === idx);
    if (!row) return;
    const patch: Partial<ReviewRow> = kind === "staff" ? { staffId: id } : { clientId: id };
    const nextStaffId = kind === "staff" ? id : row.staffId;
    const nextClientId = kind === "client" ? id : row.clientId;
    if (nextStaffId && nextClientId && row.clockInIso && row.clockOutIso) {
      patch.status = "matched";
      patch.reason = null;
    }
    updateRow(idx, patch);
  };
  const skipRow = (idx: number) => updateRow(idx, { skipped: true });
  const unskipRow = (idx: number) => updateRow(idx, { skipped: false });

  const readyRows = useMemo(
    () => rows.filter((r) => !r.skipped && r.status === "matched" && r.staffId && r.clientId && r.clockInIso && r.clockOutIso),
    [rows],
  );
  const ambiguousRows = useMemo(() => rows.filter((r) => !r.skipped && r.status === "ambiguous"), [rows]);
  const unmatchedRows = useMemo(
    () => rows.filter((r) => !r.skipped && (r.status === "no_match" || r.status === "invalid")),
    [rows],
  );
  const skippedRows = useMemo(() => rows.filter((r) => r.skipped), [rows]);

  const downloadSkipped = () => {
    if (!parsed) return;
    const bucket = [...skippedRows, ...ambiguousRows, ...unmatchedRows];
    if (bucket.length === 0) {
      toast.info("Nothing to export — every row is ready to import.");
      return;
    }
    const headers = [...parsed.headers, "skip_reason"];
    const csvRows = bucket.map((r) => {
      const row: Record<string, string> = {};
      for (const h of parsed.headers) row[h] = r.raw[h] ?? "";
      row.skip_reason = r.skipped ? (r.reason ?? "skipped by user") : (r.reason ?? "unresolved");
      return row;
    });
    const csv = Papa.unparse({ fields: headers, data: csvRows });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(parsed.fileName || "timesheets").replace(/\.[^.]+$/, "")}-skipped.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Step 4 commit ──
  const commit = useMutation({
    mutationFn: async () => {
      if (!org?.organization_id) throw new Error("No organization");
      if (readyRows.length === 0) throw new Error("Nothing to import.");
      const { jobId } = await createJob({
        data: {
          organization_id: org.organization_id,
          source_summary: `Historical timesheets from ${parsed?.fileName ?? "spreadsheet"}`,
        },
      });
      const res = await commitRows({
        data: {
          organization_id: org.organization_id,
          job_id: jobId,
          file_name: parsed?.fileName ?? "timesheets.csv",
          rows: readyRows.map((r) => ({
            staff_id: r.staffId!,
            client_id: r.clientId!,
            clock_in_iso: r.clockInIso!,
            clock_out_iso: r.clockOutIso!,
            service_code: r.serviceCode || "HISTORICAL",
            notes: r.notes || null,
            source_row: r.raw,
          })),
        },
      });
      return res;
    },
    onSuccess: (res) => {
      setCommitted({ inserted: res.inserted, staffCount: res.staffCount ?? 0 });
      setStep(4);
      toast.success(`Submitted ${res.inserted} historical timesheet${res.inserted === 1 ? "" : "s"} to staff for confirmation.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ═══ RENDER ═══
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <div className="flex items-start gap-2">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <div className="font-semibold text-amber-800">Historical timesheets — imported from another platform</div>
            <p className="mt-1 text-muted-foreground">
              This import runs in four explicit stages: <strong>upload &amp; parse</strong>, <strong>admin review</strong>,
              <strong> submit to staff</strong>, and <strong>staff confirmation</strong>. Nothing moves forward without a
              deliberate action. Rows are permanently marked as historical imports so nobody mistakes them for live clock
              punches, and staff never see anything until you (the admin) explicitly submit it to them. This flow never
              creates new staff or clients — every row must match someone who already exists.
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <Stepper step={step} />

      {step === 1 && (
        <UploadStep onPick={onPickFile} />
      )}

      {step === 2 && parsed && mapping && (
        <MapStep
          parsed={parsed}
          mapping={mapping}
          onChange={setMapping}
          onBack={() => { setStep(1); setParsed(null); setMapping(null); setFile(null); }}
          onNext={buildReviewRows}
          peopleReady={!!peopleQ.data}
          fileName={file?.name ?? ""}
        />
      )}

      {step === 3 && peopleQ.data && (
        <ReviewStep
          rows={rows}
          ready={readyRows}
          ambiguous={ambiguousRows}
          unmatched={unmatchedRows}
          skipped={skippedRows}
          people={peopleQ.data}
          onChooseStaff={chooseStaff}
          onChooseClient={chooseClient}
          onLink={linkManually}
          onSkip={skipRow}
          onUnskip={unskipRow}
          onDownloadSkipped={downloadSkipped}
          onBack={() => setStep(2)}
          onCommit={() => commit.mutate()}
          committing={commit.isPending}
        />
      )}

      {step === 4 && committed && (
        <DoneStep
          inserted={committed.inserted}
          onAnother={() => {
            setStep(1); setFile(null); setParsed(null); setMapping(null); setRows([]); setCommitted(null);
          }}
          onArchive={() => navigate({ to: "/dashboard/evv-archive" })}
        />
      )}
    </div>
  );
}

// ─── Stepper ───────────────────────────────────────────────────────────────
function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  // Wizard steps map onto the four workflow stages:
  //   Upload + Map columns  = Stage 1 (upload & parse / match)
  //   Match & review        = Stage 2 (admin review; nothing is written yet)
  //   Submitted             = Stage 3 landed; staff now own Stage 4 (confirmation)
  const items = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Map columns" },
    { n: 3, label: "Admin review" },
    { n: 4, label: "Submitted to staff" },
  ];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {items.map((it, i) => (
        <li key={it.n} className="flex items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-xs font-medium ${
              step === it.n ? "bg-primary text-primary-foreground"
                : step > it.n ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {step > it.n ? <CheckCircle2 className="h-3.5 w-3.5" /> : it.n}
          </span>
          <span className={step === it.n ? "font-medium" : "text-muted-foreground"}>{it.label}</span>
          {i < items.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
        </li>
      ))}
    </ol>
  );
}

// ─── Step 1 ────────────────────────────────────────────────────────────────
function UploadStep({ onPick }: { onPick: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      className={`rounded-2xl border-2 border-dashed p-10 text-center transition ${
        dragging ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 font-medium">Drop a CSV or Excel file</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Only spreadsheets (.csv, .xlsx, .xls). Up to 25 MB. PDFs and images aren't used for this import type — the data is already in columns.
      </p>
      <div className="mt-4">
        <input
          id="ts-import-file"
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
        />
        <label htmlFor="ts-import-file">
          <Button variant="outline" asChild><span>Choose file</span></Button>
        </label>
      </div>
    </div>
  );
}

// ─── Step 2 ────────────────────────────────────────────────────────────────
const FIELD_LABELS: Record<FieldKey, { label: string; required: boolean; hint: string }> = {
  staff: { label: "Staff member", required: true, hint: "Column holding the staff name" },
  client: { label: "Client", required: true, hint: "Column holding the client name" },
  date: { label: "Date", required: true, hint: "Shift date (skipped if clock-in already includes a date)" },
  clock_in: { label: "Clock in", required: true, hint: "Time or date+time the shift started" },
  clock_out: { label: "Clock out", required: true, hint: "Time or date+time the shift ended" },
  notes: { label: "Notes", required: false, hint: "Free-text note (optional)" },
  service_code: { label: "Service code", required: false, hint: "Billing code (optional — defaults to HISTORICAL)" },
};

function MapStep({
  parsed, mapping, onChange, onBack, onNext, peopleReady, fileName,
}: {
  parsed: ParsedFile;
  mapping: Mapping;
  onChange: (m: Mapping) => void;
  onBack: () => void;
  onNext: () => void;
  peopleReady: boolean;
  fileName: string;
}) {
  const canNext = mapping.staff && mapping.client && mapping.clock_in && mapping.clock_out &&
    (mapping.singleDateTimeIn || mapping.date);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Map your columns</div>
            <div className="text-xs text-muted-foreground">
              File: {fileName} · {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} · {parsed.headers.length} columns detected
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => {
            const meta = FIELD_LABELS[k];
            if (k === "date" && mapping.singleDateTimeIn) return null;
            return (
              <div key={k} className="space-y-1">
                <div className="flex items-center gap-1 text-xs font-medium">
                  {meta.label}
                  {meta.required && <span className="text-destructive">*</span>}
                  <span className="text-muted-foreground" title={meta.hint}>
                    <HelpCircle className="h-3 w-3" />
                  </span>
                </div>
                <Select
                  value={mapping[k] ?? "__none__"}
                  onValueChange={(v) => onChange({ ...mapping, [k]: v === "__none__" ? null : v })}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Not mapped" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— not mapped —</SelectItem>
                    {parsed.headers.map((h) => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mapping.singleDateTimeIn}
              onChange={(e) => onChange({ ...mapping, singleDateTimeIn: e.target.checked })}
            />
            The <strong>Clock in</strong> column already contains both the date and the time
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mapping.singleDateTimeOut}
              onChange={(e) => onChange({ ...mapping, singleDateTimeOut: e.target.checked })}
            />
            The <strong>Clock out</strong> column already contains both the date and the time
          </label>
        </div>
      </div>

      {parsed.rows.length > 0 && (
        <SamplePreview parsed={parsed} mapping={mapping} />
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Button>
        <Button onClick={onNext} disabled={!canNext || !peopleReady}>
          {!peopleReady && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Match & review <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SamplePreview({ parsed, mapping }: { parsed: ParsedFile; mapping: Mapping }) {
  const sample = parsed.rows.slice(0, 3);
  const cells = (row: Record<string, string>) => ({
    staff: mapping.staff ? row[mapping.staff] : "—",
    client: mapping.client ? row[mapping.client] : "—",
    date: mapping.date ? row[mapping.date] : (mapping.singleDateTimeIn ? "(from clock in)" : "—"),
    inTime: mapping.clock_in ? row[mapping.clock_in] : "—",
    outTime: mapping.clock_out ? row[mapping.clock_out] : "—",
    notes: mapping.notes ? row[mapping.notes] : "",
  });
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 text-sm font-semibold">Preview (first 3 rows)</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left">Staff</th>
              <th className="px-2 py-1 text-left">Client</th>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">In</th>
              <th className="px-2 py-1 text-left">Out</th>
              <th className="px-2 py-1 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((r, i) => {
              const c = cells(r);
              return (
                <tr key={i} className="border-t border-border/60">
                  <td className="px-2 py-1">{c.staff}</td>
                  <td className="px-2 py-1">{c.client}</td>
                  <td className="px-2 py-1">{c.date}</td>
                  <td className="px-2 py-1">{c.inTime}</td>
                  <td className="px-2 py-1">{c.outTime}</td>
                  <td className="px-2 py-1 truncate max-w-[12rem]">{c.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Step 3 ────────────────────────────────────────────────────────────────
function ReviewStep({
  rows, ready, ambiguous, unmatched, skipped, people,
  onChooseStaff, onChooseClient, onLink, onSkip, onUnskip,
  onDownloadSkipped, onBack, onCommit, committing,
}: {
  rows: ReviewRow[];
  ready: ReviewRow[];
  ambiguous: ReviewRow[];
  unmatched: ReviewRow[];
  skipped: ReviewRow[];
  people: { staff: Person[]; clients: Person[] };
  onChooseStaff: (idx: number, id: string) => void;
  onChooseClient: (idx: number, id: string) => void;
  onLink: (idx: number, kind: "staff" | "client", id: string) => void;
  onSkip: (idx: number) => void;
  onUnskip: (idx: number) => void;
  onDownloadSkipped: () => void;
  onBack: () => void;
  onCommit: () => void;
  committing: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"} parsed ·{" "}
          <span className="text-emerald-700 font-medium">{ready.length} ready</span> ·{" "}
          <span className="text-amber-700 font-medium">{ambiguous.length} needs a choice</span> ·{" "}
          <span className="text-destructive font-medium">{unmatched.length} not matched</span> ·{" "}
          <span className="text-muted-foreground">{skipped.length} skipped</span>
        </div>
        <Button variant="outline" size="sm" onClick={onDownloadSkipped}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Download skipped rows
        </Button>
      </div>

      <Tabs defaultValue="ready">
        <TabsList>
          <TabsTrigger value="ready">Ready ({ready.length})</TabsTrigger>
          <TabsTrigger value="ambiguous">Needs a choice ({ambiguous.length})</TabsTrigger>
          <TabsTrigger value="unmatched">Not matched ({unmatched.length})</TabsTrigger>
          <TabsTrigger value="skipped">Skipped ({skipped.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ready" className="mt-3">
          <ReadyTable rows={ready} onSkip={onSkip} />
        </TabsContent>

        <TabsContent value="ambiguous" className="mt-3 space-y-2">
          {ambiguous.length === 0 && <EmptyMsg text="Nothing needs a choice." />}
          {ambiguous.map((r) => (
            <AmbiguousRow key={r.idx} row={r} onChooseStaff={onChooseStaff} onChooseClient={onChooseClient} onSkip={onSkip} />
          ))}
        </TabsContent>

        <TabsContent value="unmatched" className="mt-3 space-y-2">
          {unmatched.length === 0 && <EmptyMsg text="Everything matched or was resolved." />}
          {unmatched.map((r) => (
            <UnmatchedRow key={r.idx} row={r} people={people} onLink={onLink} onSkip={onSkip} />
          ))}
        </TabsContent>

        <TabsContent value="skipped" className="mt-3 space-y-2">
          {skipped.length === 0 && <EmptyMsg text="No skipped rows." />}
          {skipped.map((r) => (
            <div key={r.idx} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-2 text-xs">
              <div className="min-w-0">
                <div className="truncate">
                  <span className="font-medium">{r.staffLabel || "(no staff)"}</span> ·{" "}
                  <span>{r.clientLabel || "(no client)"}</span> ·{" "}
                  <span className="text-muted-foreground">{r.dateStr} {r.clockInStr}→{r.clockOutStr}</span>
                </div>
                {r.reason && <div className="text-muted-foreground">Reason: {r.reason}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onUnskip(r.idx)}>Un-skip</Button>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to mapping</Button>
        <Button onClick={onCommit} disabled={committing || ready.length === 0}>
          {committing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Import {ready.length} historical timesheet{ready.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function ReadyTable({ rows, onSkip }: { rows: ReviewRow[]; onSkip: (idx: number) => void }) {
  if (rows.length === 0) return <EmptyMsg text="No ready rows yet. Resolve ambiguous or unmatched rows to move them here." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Staff</th>
            <th className="px-3 py-2 text-left">Client</th>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">In → Out</th>
            <th className="px-3 py-2 text-left">Code</th>
            <th className="px-3 py-2 text-left">Notes</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.idx} className="border-t border-border/60">
              <td className="px-3 py-1.5">{r.staffCandidates.find((s) => s.id === r.staffId)?.label ?? r.staffLabel}</td>
              <td className="px-3 py-1.5">{r.clientCandidates.find((c) => c.id === r.clientId)?.label ?? r.clientLabel}</td>
              <td className="px-3 py-1.5">{r.clockInIso ? new Date(r.clockInIso).toLocaleDateString() : r.dateStr}</td>
              <td className="px-3 py-1.5">
                {r.clockInIso ? new Date(r.clockInIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : r.clockInStr}
                {" → "}
                {r.clockOutIso ? new Date(r.clockOutIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : r.clockOutStr}
              </td>
              <td className="px-3 py-1.5 font-mono">{r.serviceCode || "HISTORICAL"}</td>
              <td className="px-3 py-1.5 max-w-[16rem] truncate">{r.notes}</td>
              <td className="px-3 py-1.5">
                <Button variant="ghost" size="sm" onClick={() => onSkip(r.idx)}><X className="h-3.5 w-3.5" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AmbiguousRow({
  row, onChooseStaff, onChooseClient, onSkip,
}: {
  row: ReviewRow;
  onChooseStaff: (idx: number, id: string) => void;
  onChooseClient: (idx: number, id: string) => void;
  onSkip: (idx: number) => void;
}) {
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Badge variant="outline" className="border-amber-500/40 text-amber-700">Ambiguous</Badge>
          <span className="ml-2 text-muted-foreground">
            {row.dateStr} · {row.clockInStr} → {row.clockOutStr}
            {row.notes && <> · <span className="italic">{row.notes.slice(0, 60)}</span></>}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSkip(row.idx)}>Skip</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 text-muted-foreground">Staff — "{row.staffLabel}"</div>
          {row.staffCandidates.length > 1 ? (
            <Select value={row.staffId ?? ""} onValueChange={(v) => onChooseStaff(row.idx, v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Pick one" /></SelectTrigger>
              <SelectContent>
                {row.staffCandidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-emerald-700">✓ {row.staffCandidates[0]?.label}</div>
          )}
        </div>
        <div>
          <div className="mb-1 text-muted-foreground">Client — "{row.clientLabel}"</div>
          {row.clientCandidates.length > 1 ? (
            <Select value={row.clientId ?? ""} onValueChange={(v) => onChooseClient(row.idx, v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Pick one" /></SelectTrigger>
              <SelectContent>
                {row.clientCandidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-emerald-700">✓ {row.clientCandidates[0]?.label}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function UnmatchedRow({
  row, people, onLink, onSkip,
}: {
  row: ReviewRow;
  people: { staff: Person[]; clients: Person[] };
  onLink: (idx: number, kind: "staff" | "client", id: string) => void;
  onSkip: (idx: number) => void;
}) {
  const [staffQ, setStaffQ] = useState("");
  const [clientQ, setClientQ] = useState("");
  const staffMatches = staffQ.trim()
    ? people.staff.filter((p) => p.label.toLowerCase().includes(staffQ.toLowerCase())).slice(0, 8)
    : [];
  const clientMatches = clientQ.trim()
    ? people.clients.filter((p) => p.label.toLowerCase().includes(clientQ.toLowerCase())).slice(0, 8)
    : [];
  const staffLabel = row.staffId ? people.staff.find((p) => p.id === row.staffId)?.label : null;
  const clientLabel = row.clientId ? people.clients.find((p) => p.id === row.clientId)?.label : null;

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Badge variant="outline" className="border-destructive/40 text-destructive">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {row.status === "invalid" ? "Invalid" : "Not matched"}
          </Badge>
          <span className="ml-2 text-muted-foreground">
            {row.reason} · {row.dateStr} {row.clockInStr}→{row.clockOutStr}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSkip(row.idx)}>Skip</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-muted-foreground">Staff — "{row.staffLabel || "(missing)"}"</div>
          {staffLabel ? (
            <div className="text-emerald-700">✓ Linked to {staffLabel}</div>
          ) : (
            <>
              <Input
                value={staffQ}
                onChange={(e) => setStaffQ(e.target.value)}
                placeholder="Search existing staff…"
                className="h-8 text-xs"
              />
              {staffMatches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onLink(row.idx, "staff", m.id); setStaffQ(""); }}
                  className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-left hover:bg-muted"
                >
                  {m.label}
                </button>
              ))}
            </>
          )}
        </div>
        <div>
          <div className="mb-1 text-muted-foreground">Client — "{row.clientLabel || "(missing)"}"</div>
          {clientLabel ? (
            <div className="text-emerald-700">✓ Linked to {clientLabel}</div>
          ) : (
            <>
              <Input
                value={clientQ}
                onChange={(e) => setClientQ(e.target.value)}
                placeholder="Search existing clients…"
                className="h-8 text-xs"
              />
              {clientMatches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onLink(row.idx, "client", m.id); setClientQ(""); }}
                  className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-left hover:bg-muted"
                >
                  {m.label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        This flow never creates new staff or clients. If the person truly doesn't exist yet, skip the row, add them through the regular Client or Employee Smart Import, then re-import the leftover rows.
      </div>
    </div>
  );
}

// ─── Step 4 ────────────────────────────────────────────────────────────────
function DoneStep({
  inserted, onAnother, onArchive,
}: {
  inserted: number;
  onAnother: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
      <div className="mt-2 font-semibold">Imported {inserted} historical timesheet{inserted === 1 ? "" : "s"}</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every imported row is permanently marked as a historical import. It will never be confused with a live clock punch.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" onClick={onAnother}>Import another spreadsheet</Button>
        <Button onClick={onArchive}>View EVV archive</Button>
      </div>
    </div>
  );
}
