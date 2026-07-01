import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText, Sparkles, X, ArrowLeft, CheckCircle2, AlertCircle, Pencil, Check, User } from "lucide-react";
import { toast } from "sonner";
import {
  createSmartImportJob,
  recordImportDocument,
  runSmartExtraction,
  getSmartImportSummary,
} from "@/lib/smart-import.functions";

const SearchSchema = z.object({ mode: z.enum(["employee", "client"]).optional() });

export const Route = createFileRoute("/dashboard/smart-import/")({
  head: () => ({ meta: [{ title: "Smart Import — NECTAR" }] }),
  validateSearch: (s) => SearchSchema.parse(s),
  component: () => (
    <RequirePermission perm="manage_users">
      <SmartImportPage />
    </RequirePermission>
  ),
});

type Mode = "employee" | "client";
type FileChip = {
  id: string;
  file: File;
  kind: "roster" | "ai_doc";
  detectedClient: string | null;   // display label (e.g. "BA" or "Blake Adam")
  clientKey: string;               // normalized grouping key ("" = unassigned)
  detectedDocType: string;         // "PCSP", "Behavior Plan", "Document", "Roster", ...
  detectedDate: string | null;     // "6/1/26" or "2026-06-01"
  rowCount?: number;               // for roster files
};
const ALLOWED_EXT = [".pdf", ".docx", ".csv", ".xlsx", ".xls"];
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

function isAiDoc(f: File): boolean {
  const n = f.name.toLowerCase();
  return n.endsWith(".pdf") || n.endsWith(".docx");
}
function isRoster(f: File): boolean {
  const n = f.name.toLowerCase();
  return n.endsWith(".csv") || n.endsWith(".xlsx") || n.endsWith(".xls");
}
function validateFile(f: File): string | null {
  if (f.size > MAX_BYTES) return `${f.name} is larger than 25 MB`;
  const ok = ALLOWED_EXT.some((e) => f.name.toLowerCase().endsWith(e)) || ALLOWED_MIME.includes(f.type);
  if (!ok) return `${f.name} is not an allowed file type`;
  return null;
}

type ParsedRoster = { headers: string[]; rows: Record<string, string>[] };
async function parseRoster(file: File): Promise<ParsedRoster> {
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
    return { headers, rows };
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = json.length ? Object.keys(json[0]) : [];
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = String(r[h] ?? "").trim();
    return out;
  });
  return { headers, rows };
}

async function readDocText(file: File): Promise<string> {
  // PDF/DOCX text extraction will run server-side via Bedrock later.
  // For now, send the filename + size as a placeholder so the fake extractor
  // still produces a subject. Plain text is sent as-is when possible.
  if (file.type.startsWith("text/")) {
    try { return (await file.text()).slice(0, 100_000); } catch { /* ignore */ }
  }
  return `Imported document: ${file.name}`;
}

// ─── Client-side heuristic detection for the pre-flight preview ──────────────
// Order matters: check more-specific keywords before generic ones.
const DOC_TYPE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "PCSP", re: /\bpcsp\b/i },
  { label: "Person-Centered Profile", re: /person[\s_-]*centered|\bpcp\b/i },
  { label: "ISP", re: /\bisp\b/i },
  { label: "IEP", re: /\biep\b/i },
  { label: "Behavior Plan", re: /\bbsp\b|behavior[\s_-]*(support|plan)/i },
  { label: "Medication (MAR)", re: /\bmar\b|medication/i },
  { label: "Authorization (1056)", re: /\b1056\b|authorization|auth[\s_-]*form/i },
  { label: "Assessment", re: /assessment|\bica\b|\bsis\b/i },
  { label: "Consent", re: /consent|release/i },
  { label: "Progress Note", re: /progress[\s_-]*note/i },
  { label: "Incident Report", re: /incident/i },
  { label: "Emergency Plan", re: /emergency/i },
  { label: "Diet / Nutrition", re: /diet|nutrition|meal[\s_-]*plan/i },
  { label: "Seizure Protocol", re: /seizure/i },
  { label: "DNR", re: /\bdnr\b|do[\s_-]*not[\s_-]*resuscitate/i },
  { label: "Guardianship", re: /guardian/i },
  { label: "Human Rights", re: /human[\s_-]*rights|\bhrc\b/i },
];

const DATE_RE = /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/;
const NOISE_TOKENS = /\b(draft|final|copy|updated|revised|signed|scan|scanned|v\d+)\b/gi;

function detectFromFilename(file: File): {
  detectedClient: string | null;
  clientKey: string;
  detectedDocType: string;
  detectedDate: string | null;
} {
  const base = file.name.replace(/\.[^.]+$/, "");
  // doc type
  let docType = "Document";
  let matchedRe: RegExp | null = null;
  for (const p of DOC_TYPE_PATTERNS) {
    if (p.re.test(base)) { docType = p.label; matchedRe = p.re; break; }
  }
  // date
  const dateMatch = base.match(DATE_RE);
  const detectedDate = dateMatch ? dateMatch[1] : null;

  // strip doc-type keyword, date, and noise; the leftover is (hopefully) the person
  let rest = base;
  if (matchedRe) rest = rest.replace(matchedRe, " ");
  if (dateMatch) rest = rest.replace(dateMatch[0], " ");
  rest = rest.replace(NOISE_TOKENS, " ");
  rest = rest.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
  // trim trailing punctuation and parentheticals
  rest = rest.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

  let detectedClient: string | null = null;
  if (rest.length > 0 && rest.length <= 60) {
    const parts = rest.split(" ").filter(Boolean);
    // If it looks like initials (2-3 caps) keep as-is uppercased
    if (parts.length === 1 && /^[A-Za-z]{2,3}$/.test(parts[0])) {
      detectedClient = parts[0].toUpperCase();
    } else if (parts.length >= 1 && parts.length <= 4) {
      detectedClient = parts
        .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
        .join(" ");
    }
  }
  const clientKey = detectedClient ? detectedClient.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return { detectedClient, clientKey, detectedDocType: docType, detectedDate };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fileExt(f: File): string {
  const m = f.name.match(/\.([^.]+)$/);
  return m ? m[1].toUpperCase() : "FILE";
}

function SmartImportPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>(search.mode ?? "client");
  const [files, setFiles] = useState<FileChip[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  const createJob = useServerFn(createSmartImportJob);
  const recordDoc = useServerFn(recordImportDocument);
  const runExtraction = useServerFn(runSmartExtraction);
  const getSummary = useServerFn(getSmartImportSummary);

  const onAddFiles = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list);
    const next: FileChip[] = [];
    for (const f of arr) {
      const err = validateFile(f);
      if (err) { toast.error(err); continue; }
      const kind: FileChip["kind"] = isAiDoc(f) ? "ai_doc" : "roster";
      next.push({ id: crypto.randomUUID(), file: f, kind });
    }
    if (next.length) setFiles((p) => [...p, ...next]);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) onAddFiles(e.dataTransfer.files);
  }, [onAddFiles]);

  const removeFile = (id: string) => setFiles((p) => p.filter((c) => c.id !== id));

  const canProcess = useMemo(
    () => (files.length > 0 || pasteText.trim().length > 0) && !!org?.organization_id,
    [files, pasteText, org],
  );

  const process = useMutation({
    mutationFn: async () => {
      if (!org?.organization_id) throw new Error("No organization");
      setProgress("Creating import job…");
      const { jobId: newJobId } = await createJob({
        data: { organizationId: org.organization_id, mode },
      });
      setJobId(newJobId);

      // Upload + record each file
      const rosterBatches: Array<{
        source_document_id: string;
        file_name: string;
        headers: string[];
        rows: Record<string, string>[];
      }> = [];
      const textBlobs: Array<{
        source_document_id: string | null;
        file_name: string;
        text: string;
      }> = [];

      for (let i = 0; i < files.length; i++) {
        const chip = files[i];
        setProgress(`Uploading ${i + 1} of ${files.length}: ${chip.file.name}`);
        const path = `${org.organization_id}/${newJobId}/${crypto.randomUUID()}-${chip.file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("import-documents")
          .upload(path, chip.file, { contentType: chip.file.type || "application/octet-stream", upsert: false });
        if (upErr) throw new Error(`Upload failed for ${chip.file.name}: ${upErr.message}`);

        const { documentId } = await recordDoc({
          data: {
            organizationId: org.organization_id,
            jobId: newJobId,
            file_name: chip.file.name,
            file_type: chip.file.type || null as unknown as string,
            file_size: chip.file.size,
            storage_path: path,
          },
        });

        if (chip.kind === "roster") {
          const parsed = await parseRoster(chip.file);
          if (parsed.rows.length) {
            rosterBatches.push({
              source_document_id: documentId,
              file_name: chip.file.name,
              headers: parsed.headers,
              rows: parsed.rows,
            });
          }
        } else {
          // PDF/DOCX: server downloads from the bucket and extracts text
          // itself (real PDF parse + AI). Don't send a client-side placeholder.
        }

      }

      if (pasteText.trim()) {
        // Heuristic: pasted CSV-like → roster, otherwise text blob.
        const looksCsv = /,|\t/.test(pasteText) && pasteText.includes("\n");
        if (looksCsv) {
          const res = Papa.parse<Record<string, string>>(pasteText, { header: true, skipEmptyLines: true });
          const headers = res.meta.fields ?? [];
          const rows = (res.data ?? []).map((r) => {
            const out: Record<string, string> = {};
            for (const h of headers) out[h] = String(r[h] ?? "").trim();
            return out;
          });
          // No document for pasted content — use a placeholder doc row
          const path = `${org.organization_id}/${newJobId}/${crypto.randomUUID()}-pasted.csv`;
          await supabase.storage.from("import-documents").upload(path, new Blob([pasteText], { type: "text/csv" }), { upsert: false });
          const { documentId } = await recordDoc({
            data: {
              organizationId: org.organization_id, jobId: newJobId,
              file_name: "Pasted table.csv", file_type: "text/csv",
              file_size: pasteText.length, storage_path: path,
            },
          });
          if (rows.length) rosterBatches.push({ source_document_id: documentId, file_name: "Pasted table.csv", headers, rows });
        } else {
          textBlobs.push({ source_document_id: null, file_name: "Pasted text", text: pasteText.slice(0, 100_000) });
        }
      }

      setProgress("NECTAR is reading your documents…");
      const summary = await runExtraction({
        data: { organizationId: org.organization_id, jobId: newJobId, rosterBatches, textBlobs },
      });
      return { jobId: newJobId, summary };
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setProgress("");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-import-summary"] });
      setProgress("");
    },
  });

  const summaryQuery = useQuery({
    queryKey: ["smart-import-summary", jobId],
    enabled: !!jobId && process.isSuccess,
    queryFn: () => getSummary({ data: { jobId: jobId! } }),
    refetchInterval: (q) => (q.state.data?.status === "in_review" ? false : 1500),
  });

  const done = summaryQuery.data?.status === "in_review";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <Link to="/dashboard/smart-import/history" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
          Import history
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Smart Import</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Drop in documents, rosters, or paste a table. NECTAR will read everything together, fill in
              known fields, spin up custom attributes for anything new, and flag whatever needs your eye.
              Nothing is created in your real records until you review.
            </p>
          </div>
        </div>
      </div>

      {/* Mode switch */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-1 w-fit">
        {(["client", "employee"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => !process.isPending && setMode(m)}
            disabled={process.isPending || !!jobId}
            className={`px-4 py-1.5 text-sm rounded-md transition ${
              mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "client" ? "Client" : "Employee"}
          </button>
        ))}
      </div>

      {!jobId && (
        <>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
              isDragging ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Drop PDFs, DOCX, CSV, or Excel files here</p>
            <p className="mt-1 text-xs text-muted-foreground">Up to 25 MB each. Allowed: .pdf, .docx, .csv, .xlsx</p>
            <div className="mt-4">
              <input
                id="smart-import-file"
                type="file"
                multiple
                accept=".pdf,.docx,.csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files && onAddFiles(e.target.files)}
              />
              <label htmlFor="smart-import-file">
                <Button variant="outline" size="sm" asChild><span>Choose files</span></Button>
              </label>
            </div>
          </div>

          {/* File chips */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((c) => (
                <div key={c.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{c.file.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{c.kind === "roster" ? "roster" : "document"}</Badge>
                  <button onClick={() => removeFile(c.id)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Paste box */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-sm font-medium">Or paste a CSV / table</div>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste rows here — NECTAR will detect headers and fan out one row per person."
              className="mt-2 h-32 font-mono text-xs"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => process.mutate()}
              disabled={!canProcess || process.isPending}
              size="lg"
            >
              {process.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Sparkles className="mr-2 h-4 w-4" /> Process with NECTAR
            </Button>
          </div>
        </>
      )}

      {/* Progress + summary */}
      {jobId && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          {!done ? (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <div className="font-medium">{progress || "Working…"}</div>
                <div className="text-xs text-muted-foreground">
                  Status: {summaryQuery.data?.status ?? "extracting"} — you can leave this page; the job will keep running.
                </div>
              </div>
            </div>
          ) : (
            <SummaryView
              jobId={jobId}
              docs={summaryQuery.data?.documents ?? 0}
              subjects={summaryQuery.data?.subjects ?? 0}
              matched={summaryQuery.data?.matched_existing ?? 0}
              review={summaryQuery.data?.review_items ?? 0}
              onReview={() => navigate({ to: "/dashboard/smart-import/$jobId/review", params: { jobId } })}
              onAnother={() => { setJobId(null); setFiles([]); setPasteText(""); }}
            />
          )}
          {process.isError && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <div className="font-medium text-destructive">Extraction failed</div>
                <div className="text-muted-foreground">{(process.error as Error)?.message}</div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => process.mutate()}>Retry</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryView({
  jobId, docs, subjects, matched, review, onReview, onAnother,
}: {
  jobId: string; docs: number; subjects: number; matched: number; review: number;
  onReview: () => void; onAnother: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-primary">
        <CheckCircle2 className="h-5 w-5" />
        <div className="font-semibold">NECTAR finished reading</div>
      </div>
      <p className="mt-2 text-sm">
        NECTAR read <strong>{docs}</strong> document{docs === 1 ? "" : "s"} ·
        found <strong>{subjects}</strong> {subjects === 1 ? "person" : "people"} ·
        <strong> {matched}</strong> match existing records ·
        <strong> {review}</strong> {review === 1 ? "item needs" : "items need"} review.
      </p>
      <div className="mt-4 flex gap-2">
        <Button onClick={onReview}>Review placement</Button>
        <Button variant="outline" onClick={onAnother}>Import more</Button>
        <Link to="/dashboard/smart-import/$jobId/review" params={{ jobId }} className="hidden">go</Link>
      </div>
    </div>
  );
}
