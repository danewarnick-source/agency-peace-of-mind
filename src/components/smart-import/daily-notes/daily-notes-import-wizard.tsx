// Historical daily-notes / shift-notes import wizard — spreadsheet-only
// (CSV/XLSX), column-mapping + name-based matching against EXISTING staff and
// clients. NEVER creates new staff or client records. Anything imported here
// is permanently marked import_source='historical_import' on daily_logs.
//
// Target use case: Host Home providers bringing over daily notes from another
// platform (no time clock — just staff, client, date, narrative, and any
// goals the note addressed).
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Upload, X, Loader2, ArrowRight, ArrowLeft, Download,
  CheckCircle2, AlertTriangle, HelpCircle, Archive, FileText, Wrench,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useCurrentOrg } from "@/hooks/use-org";

import {
  createDailyNotesImportJob,
  importHistoricalDailyNotes,
} from "@/lib/smart-import-daily-notes.functions";

type ParsedFile = { headers: string[]; rows: Record<string, string>[]; fileName: string };

type FieldKey = "staff" | "client" | "date" | "narrative" | "goals";

type Mapping = Record<FieldKey, string | null>;

type Person = { id: string; label: string; norms: string[] };

type MatchStatus = "matched" | "ambiguous" | "incomplete";

type ReviewRow = {
  idx: number;
  raw: Record<string, string>;
  staffLabel: string;
  clientLabel: string;
  dateStr: string;
  narrative: string;
  goals: string[];
  staffCandidates: Person[];
  clientCandidates: Person[];
  staffId: string | null;
  clientId: string | null;
  logDateIso: string | null;
  status: MatchStatus;
  reason: string | null;
  skipped: boolean;
  // Track which pieces were originally missing / unresolvable so the
  // Incomplete panel only surfaces inputs for the actual gaps. Filled in
  // manually by the human — nothing is ever auto-generated.
  missing: { staff: boolean; client: boolean; date: boolean; narrative: boolean };
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
  const parts = q.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const reversed = `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`;
    const rev = pool.filter((p) => p.norms.includes(reversed));
    if (rev.length > 0) return rev;
  }
  if (parts.length === 1) {
    const last = parts[0];
    const byLast = pool.filter((p) => p.norms.some((n) => n.endsWith(` ${last}`) || n === last));
    if (byLast.length > 0) return byLast;
  }
  if (parts.length === 2 && parts[0].length === 1) {
    const init = pool.filter((p) => p.norms.includes(`${parts[0]} ${parts[1]}`));
    if (init.length > 0) return init;
  }
  return [];
}

// ─── date parsing ──────────────────────────────────────────────────────────
function tryParseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const iso = new Date(dateStr);
  if (!isNaN(iso.getTime()) && /\d{4}/.test(dateStr)) return iso;
  const m = dateStr.match(/^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*$/);
  if (m) {
    let [, mm, dd, yy] = m;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// ─── goals splitting ───────────────────────────────────────────────────────
// Accept goals as newline / semicolon / bullet-separated. Any leading bullet
// character is stripped; each entry is trimmed and capped at 500 chars.
function splitGoals(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n|;|•|·|\u2022/)
    .map((s) => s.replace(/^[\s\-*·•]+/, "").trim())
    .filter((s) => s.length > 0)
    .slice(0, 50)
    .map((s) => s.slice(0, 500));
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
    staff: find([/\b(staff|employee|worker|caregiver|dsp|provider|author|written[\s_-]?by|host)\b/]),
    client: find([/\b(client|member|consumer|recipient|individual|participant|person)\b/]),
    date: find([/\b(note[\s_-]?date|date|day|entry[\s_-]?date|shift[\s_-]?date)\b/]),
    narrative: find([/\b(narrative|note|notes|entry|shift[\s_-]?note|daily[\s_-]?note|comment|comments|description|body|text|summary)\b/]),
    goals: find([/\b(goal|goals|objective|objectives|target|targets|pcsp|progress)\b/]),
  };
}

// ═══════════════════════════════════════════════════════════════════════════

export function DailyNotesImportWizard() {
  const { data: org } = useCurrentOrg();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [committed, setCommitted] = useState<{ inserted: number } | null>(null);

  const createJob = useServerFn(createDailyNotesImportJob);
  const commitRows = useServerFn(importHistoricalDailyNotes);

  const peopleQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["daily-notes-import-people", org?.organization_id],
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

  const onPickFile = useCallback(async (f: File) => {
    const okExt = ALLOWED_EXT.some((e) => f.name.toLowerCase().endsWith(e));
    if (!okExt) {
      toast.error("Historical daily-notes import only accepts CSV or Excel (.csv, .xlsx, .xls).");
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

  const buildReviewRows = useCallback(() => {
    if (!parsed || !mapping || !peopleQ.data) return;
    const { staff, clients } = peopleQ.data;
    const result: ReviewRow[] = parsed.rows.map((raw, idx) => {
      const staffLabel = mapping.staff ? raw[mapping.staff] ?? "" : "";
      const clientLabel = mapping.client ? raw[mapping.client] ?? "" : "";
      const dateStr = mapping.date ? raw[mapping.date] ?? "" : "";
      const narrative = (mapping.narrative ? raw[mapping.narrative] ?? "" : "").trim();
      const goals = mapping.goals ? splitGoals(raw[mapping.goals] ?? "") : [];

      const staffCandidates = findCandidates(staff, staffLabel);
      const clientCandidates = findCandidates(clients, clientLabel);
      const d = tryParseDate(dateStr);

      const missing = {
        staff: !staffLabel || staffCandidates.length === 0,
        client: !clientLabel || clientCandidates.length === 0,
        date: !dateStr || !d,
        narrative: !narrative,
      };

      let status: MatchStatus;
      let reason: string | null = null;
      let staffId: string | null = null;
      let clientId: string | null = null;

      const structuralGap =
        missing.staff || missing.client || missing.date || missing.narrative;

      if (structuralGap) {
        status = "incomplete";
        const parts: string[] = [];
        if (missing.date) parts.push(dateStr ? "unreadable date" : "missing date");
        if (missing.staff) parts.push(staffLabel ? "no staff match" : "missing staff");
        if (missing.client) parts.push(clientLabel ? "no client match" : "missing client");
        if (missing.narrative) parts.push("blank narrative");
        reason = parts.join(" · ");
        // Pre-fill unambiguous single candidates so the human only fills real gaps.
        if (staffCandidates.length === 1) staffId = staffCandidates[0].id;
        if (clientCandidates.length === 1) clientId = clientCandidates[0].id;
      } else if (staffCandidates.length > 1 || clientCandidates.length > 1) {
        status = "ambiguous";
        reason = "multiple possible matches";
        if (staffCandidates.length === 1) staffId = staffCandidates[0].id;
        if (clientCandidates.length === 1) clientId = clientCandidates[0].id;
      } else {
        status = "matched";
        staffId = staffCandidates[0].id;
        clientId = clientCandidates[0].id;
      }

      return {
        idx,
        raw,
        staffLabel, clientLabel, dateStr, narrative, goals,
        staffCandidates, clientCandidates,
        staffId, clientId,
        logDateIso: d ? d.toISOString().slice(0, 10) : null,
        status, reason,
        skipped: false,
        missing,
      };
    });
    setRows(result);
    setStep(3);
  }, [parsed, mapping, peopleQ.data]);

  // Recompute status after any manual edit. A row becomes 'matched' only when
  // staff, client, date, and narrative are all present. Nothing here fills in
  // missing content — that's always a human decision on the review screen.
  const recompute = (row: ReviewRow): ReviewRow => {
    const hasAll = !!row.staffId && !!row.clientId && !!row.logDateIso && !!row.narrative.trim();
    if (hasAll) return { ...row, status: "matched", reason: null };
    if (row.status === "ambiguous") return row;
    return { ...row, status: "incomplete" };
  };

  const patchAndRecompute = (idx: number, patch: Partial<ReviewRow>) => {
    setRows((r) => r.map((row) => (row.idx === idx ? recompute({ ...row, ...patch }) : row)));
  };

  const chooseStaff = (idx: number, id: string) => patchAndRecompute(idx, { staffId: id });
  const chooseClient = (idx: number, id: string) => patchAndRecompute(idx, { clientId: id });
  const linkManually = (idx: number, kind: "staff" | "client", id: string) =>
    patchAndRecompute(idx, kind === "staff" ? { staffId: id } : { clientId: id });

  // Manual fill-ins for structural gaps. Only invoked from the Incomplete
  // panel; nothing here is inferred — the human types the value.
  const setNarrative = (idx: number, text: string) =>
    patchAndRecompute(idx, { narrative: text });
  const setDate = (idx: number, isoDate: string) => {
    // isoDate arrives from <input type="date"> as YYYY-MM-DD, or "" when cleared.
    patchAndRecompute(idx, {
      logDateIso: isoDate || null,
      dateStr: isoDate || "",
    });
  };

  const skipRow = (idx: number) => setRows((r) => r.map((row) => row.idx === idx ? { ...row, skipped: true } : row));
  const unskipRow = (idx: number) => setRows((r) => r.map((row) => row.idx === idx ? { ...row, skipped: false } : row));

  const readyRows = useMemo(
    () => rows.filter((r) => !r.skipped && r.status === "matched" && r.staffId && r.clientId && r.logDateIso && r.narrative),
    [rows],
  );
  const ambiguousRows = useMemo(() => rows.filter((r) => !r.skipped && r.status === "ambiguous"), [rows]);
  const incompleteRows = useMemo(
    () => rows.filter((r) => !r.skipped && r.status === "incomplete"),
    [rows],
  );
  const skippedRows = useMemo(() => rows.filter((r) => r.skipped), [rows]);

  const downloadSkipped = () => {
    if (!parsed) return;
    const bucket = [...skippedRows, ...ambiguousRows, ...incompleteRows];
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
    a.download = `${(parsed.fileName || "daily-notes").replace(/\.[^.]+$/, "")}-skipped.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const commit = useMutation({
    mutationFn: async () => {
      if (!org?.organization_id) throw new Error("No organization");
      if (readyRows.length === 0) throw new Error("Nothing to import.");
      const { jobId } = await createJob({
        data: {
          organization_id: org.organization_id,
          source_summary: `Historical daily notes from ${parsed?.fileName ?? "spreadsheet"}`,
        },
      });
      const res = await commitRows({
        data: {
          organization_id: org.organization_id,
          job_id: jobId,
          file_name: parsed?.fileName ?? "daily-notes.csv",
          rows: readyRows.map((r) => ({
            staff_id: r.staffId!,
            client_id: r.clientId!,
            log_date: r.logDateIso!,
            narrative: r.narrative,
            pcsp_goals_addressed: r.goals,
            source_row: r.raw,
          })),
        },
      });
      return res;
    },
    onSuccess: (res) => {
      setCommitted({ inserted: res.inserted });
      setStep(4);
      toast.success(`Imported ${res.inserted} historical daily note${res.inserted === 1 ? "" : "s"}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <div className="flex items-start gap-2">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <div className="font-semibold text-amber-800">Historical daily notes — imported from another platform</div>
            <p className="mt-1 text-muted-foreground">
              Bring in past daily notes / shift notes from whatever platform you used before HIVE — including
              Host Home daily notes where nobody clocks in. Only five things are read from the file: who wrote it,
              who it's about, the date, the written narrative, and (optionally) any goals the note addressed.
              Every row must match a staff member and a client that already exist in HIVE; anything else is set
              aside for manual resolution and is never auto-created. Imported notes are permanently marked as
              historical so they're never confused with a note written live in HIVE.
            </p>
          </div>
        </div>
      </div>

      <Stepper step={step} />

      {step === 1 && <UploadStep onPick={onPickFile} />}

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
          incomplete={incompleteRows}
          skipped={skippedRows}
          people={peopleQ.data}
          onChooseStaff={chooseStaff}
          onChooseClient={chooseClient}
          onLink={linkManually}
          onSetNarrative={setNarrative}
          onSetDate={setDate}
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
        />
      )}
    </div>
  );
}

// ─── Stepper ───────────────────────────────────────────────────────────────
function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  const items = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Map columns" },
    { n: 3, label: "Match & review" },
    { n: 4, label: "Done" },
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
        Only spreadsheets (.csv, .xlsx, .xls). Up to 25 MB. PDFs and scanned documents aren't used for this
        import type — the data has to already be in columns.
      </p>
      <div className="mt-4">
        <input
          id="daily-notes-import-file"
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
        />
        <label htmlFor="daily-notes-import-file">
          <Button variant="outline" asChild><span>Choose file</span></Button>
        </label>
      </div>
    </div>
  );
}

// ─── Step 2 ────────────────────────────────────────────────────────────────
const FIELD_LABELS: Record<FieldKey, { label: string; required: boolean; hint: string }> = {
  staff: { label: "Staff member (who wrote it)", required: true, hint: "Column holding the staff / host name" },
  client: { label: "Client (who it's about)", required: true, hint: "Column holding the client name" },
  date: { label: "Note date", required: true, hint: "The day the note was written / the shift happened" },
  narrative: { label: "Narrative", required: true, hint: "The written note itself" },
  goals: { label: "Goals addressed", required: false, hint: "Optional — column listing PCSP goals or objectives worked on. Separate multiple goals with new lines or semicolons." },
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
  const canNext = mapping.staff && mapping.client && mapping.date && mapping.narrative;
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
        <p className="mt-3 text-[11px] text-muted-foreground">
          Any other columns in your file (billing codes, times, service types, etc.) are ignored on purpose — this import
          is only for the written narrative and the goals it addressed.
        </p>
      </div>

      {parsed.rows.length > 0 && <SamplePreview parsed={parsed} mapping={mapping} />}

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
    date: mapping.date ? row[mapping.date] : "—",
    narrative: mapping.narrative ? row[mapping.narrative] : "",
    goals: mapping.goals ? splitGoals(row[mapping.goals] ?? "") : [],
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
              <th className="px-2 py-1 text-left">Narrative</th>
              <th className="px-2 py-1 text-left">Goals</th>
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
                  <td className="px-2 py-1 max-w-[24rem] truncate">{c.narrative}</td>
                  <td className="px-2 py-1 max-w-[12rem]">
                    {c.goals.length === 0 ? <span className="text-muted-foreground">—</span>
                      : c.goals.map((g, gi) => (
                          <div key={gi} className="truncate">• {g}</div>
                        ))}
                  </td>
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
  rows, ready, ambiguous, incomplete, skipped, people,
  onChooseStaff, onChooseClient, onLink, onSetNarrative, onSetDate,
  onSkip, onUnskip, onDownloadSkipped, onBack, onCommit, committing,
}: {
  rows: ReviewRow[];
  ready: ReviewRow[];
  ambiguous: ReviewRow[];
  incomplete: ReviewRow[];
  skipped: ReviewRow[];
  people: { staff: Person[]; clients: Person[] };
  onChooseStaff: (idx: number, id: string) => void;
  onChooseClient: (idx: number, id: string) => void;
  onLink: (idx: number, kind: "staff" | "client", id: string) => void;
  onSetNarrative: (idx: number, text: string) => void;
  onSetDate: (idx: number, isoDate: string) => void;
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
          <span className="text-destructive font-medium">{incomplete.length} incomplete</span> ·{" "}
          <span className="text-muted-foreground">{skipped.length} skipped</span>
        </div>
        <Button variant="outline" size="sm" onClick={onDownloadSkipped}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Download unresolved rows
        </Button>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">About the Incomplete group:</span> rows land here when
        something structural is missing — no date, no matchable staff/client, or no written narrative. You can
        fill in a missing piece manually if you actually know it, or skip the row. Nothing is ever auto-filled
        or auto-generated. Rows that <em>do</em> import but read as thin or short aren't flagged here — the
        staff member who wrote the note will get the chance to expand it during their own attestation review.
      </div>

      <Tabs defaultValue={incomplete.length > 0 ? "incomplete" : "ready"}>
        <TabsList>
          <TabsTrigger value="ready">Ready ({ready.length})</TabsTrigger>
          <TabsTrigger value="ambiguous">Needs a choice ({ambiguous.length})</TabsTrigger>
          <TabsTrigger value="incomplete">Incomplete ({incomplete.length})</TabsTrigger>
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

        <TabsContent value="incomplete" className="mt-3 space-y-2">
          {incomplete.length === 0 && <EmptyMsg text="No incomplete rows — every parsed row has staff, client, date, and a narrative." />}
          {incomplete.map((r) => (
            <IncompleteRow
              key={r.idx}
              row={r}
              people={people}
              onLink={onLink}
              onSetNarrative={onSetNarrative}
              onSetDate={onSetDate}
              onSkip={onSkip}
            />
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
                  <span className="text-muted-foreground">{r.dateStr}</span>
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
          Import {ready.length} historical daily note{ready.length === 1 ? "" : "s"}
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
            <th className="px-3 py-2 text-left">Narrative</th>
            <th className="px-3 py-2 text-left">Goals</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.idx} className="border-t border-border/60 align-top">
              <td className="px-3 py-1.5">{r.staffCandidates.find((s) => s.id === r.staffId)?.label ?? r.staffLabel}</td>
              <td className="px-3 py-1.5">{r.clientCandidates.find((c) => c.id === r.clientId)?.label ?? r.clientLabel}</td>
              <td className="px-3 py-1.5">{r.logDateIso ?? r.dateStr}</td>
              <td className="px-3 py-1.5 max-w-[28rem]">
                <div className="line-clamp-2">{r.narrative}</div>
              </td>
              <td className="px-3 py-1.5 max-w-[14rem]">
                {r.goals.length === 0 ? <span className="text-muted-foreground">—</span>
                  : <div className="space-y-0.5">
                      {r.goals.slice(0, 3).map((g, gi) => <div key={gi} className="truncate">• {g}</div>)}
                      {r.goals.length > 3 && <div className="text-muted-foreground">+{r.goals.length - 3} more</div>}
                    </div>}
              </td>
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
            {row.dateStr}
            {row.narrative && <> · <span className="italic">{row.narrative.slice(0, 80)}{row.narrative.length > 80 ? "…" : ""}</span></>}
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

function IncompleteRow({
  row, people, onLink, onSetNarrative, onSetDate, onSkip,
}: {
  row: ReviewRow;
  people: { staff: Person[]; clients: Person[] };
  onLink: (idx: number, kind: "staff" | "client", id: string) => void;
  onSetNarrative: (idx: number, text: string) => void;
  onSetDate: (idx: number, isoDate: string) => void;
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

  const needsStaff = !row.staffId;
  const needsClient = !row.clientId;
  const needsDate = !row.logDateIso;
  const needsNarrative = !row.narrative.trim();

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Badge variant="outline" className="border-destructive/40 text-destructive">
            <Wrench className="mr-1 h-3 w-3" />
            Incomplete
          </Badge>
          <span className="ml-2 text-muted-foreground">{row.reason}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSkip(row.idx)}>Skip row</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Staff */}
        <div>
          <div className="mb-1 text-muted-foreground">
            Staff — {row.staffLabel ? `"${row.staffLabel}"` : <span className="italic">(blank in file)</span>}
          </div>
          {!needsStaff && staffLabel ? (
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

        {/* Client */}
        <div>
          <div className="mb-1 text-muted-foreground">
            Client — {row.clientLabel ? `"${row.clientLabel}"` : <span className="italic">(blank in file)</span>}
          </div>
          {!needsClient && clientLabel ? (
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

        {/* Date */}
        <div>
          <div className="mb-1 text-muted-foreground">
            Date — {row.dateStr ? <>original value: <span className="italic">"{row.dateStr}"</span></> : <span className="italic">(blank in file)</span>}
          </div>
          {!needsDate ? (
            <div className="text-emerald-700">✓ {row.logDateIso}</div>
          ) : (
            <Input
              type="date"
              value=""
              onChange={(e) => onSetDate(row.idx, e.target.value)}
              className="h-8 text-xs"
            />
          )}
          {needsDate && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Only fill this in if you actually know the date the note was written. Don't guess.
            </div>
          )}
        </div>

        {/* Narrative */}
        <div>
          <div className="mb-1 text-muted-foreground">
            Narrative — {needsNarrative ? <span className="italic">(blank in file)</span> : "provided"}
          </div>
          {!needsNarrative ? (
            <div className="rounded border border-border bg-background p-2 text-muted-foreground line-clamp-3">
              {row.narrative}
            </div>
          ) : (
            <Textarea
              value={row.narrative}
              onChange={(e) => onSetNarrative(row.idx, e.target.value)}
              placeholder="Type the note here only if you know what was written that day. Otherwise skip the row."
              className="min-h-[72px] text-xs"
            />
          )}
        </div>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        This flow never creates new staff or clients and never invents dates or note content. If a piece of information
        genuinely isn't known, skip the row instead of guessing.
      </div>
    </div>
  );
}

// ─── Step 4 ────────────────────────────────────────────────────────────────
function DoneStep({
  inserted, onAnother,
}: {
  inserted: number;
  onAnother: () => void;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
      <div className="mt-2 font-semibold">Imported {inserted} historical daily note{inserted === 1 ? "" : "s"}</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every imported note is permanently marked as a historical import and stored on the client's record.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" onClick={onAnother}>
          <FileText className="mr-1.5 h-4 w-4" /> Import another spreadsheet
        </Button>
      </div>
    </div>
  );
}
