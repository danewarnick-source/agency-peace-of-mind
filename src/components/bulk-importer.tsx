import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sparkles, Upload, FileSpreadsheet, Loader2, CheckCircle2, Wand2, FileText } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { bulkImportRoster } from "@/lib/bulk-import.functions";
import { useQueryClient } from "@tanstack/react-query";
import { AiPdfImporter } from "@/components/ai-pdf-importer";
type Kind = "employee" | "client";
type DataType = "text" | "number" | "boolean" | "date";

const CORE_FIELDS: Record<Kind, { key: string; label: string; required?: boolean }[]> = {
  employee: [
    { key: "full_name", label: "Full Name", required: true },
    { key: "first_name", label: "First Name" },
    { key: "last_name", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "position", label: "Position / Title" },
    { key: "hire_date", label: "Hire Date" },
    { key: "team_name", label: "Facility / Program" },
  ],
  client: [
    { key: "first_name", label: "First Name", required: true },
    { key: "last_name", label: "Last Name", required: true },
    { key: "full_name", label: "Full Name (split)" },
    { key: "phone", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "medicaid_id", label: "Medicaid ID" },
    { key: "job_code", label: "Job Codes" },
    { key: "team_name", label: "Facility / Program" },
  ],
};

const HEURISTICS: Record<string, string[]> = {
  full_name: ["full name", "name", "worker name", "employee name", "staff name", "client name", "individual"],
  first_name: ["first", "first name", "given", "fname"],
  last_name: ["last", "last name", "surname", "lname", "family"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "mobile", "cell", "tel", "contact"],
  position: ["position", "title", "role", "job title"],
  hire_date: ["hire", "hire date", "start date", "date of hire", "joined"],
  team_name: ["team", "facility", "location", "program", "home", "house", "group home", "site"],
  address: ["address", "street", "physical address", "residence"],
  medicaid_id: ["medicaid", "medicaid id", "client id", "member id"],
  job_code: ["job code", "service code", "auth code"],
};

function aiGuessCore(header: string, kind: Kind): string | null {
  const norm = header.toLowerCase().trim();
  const fields = CORE_FIELDS[kind].map((f) => f.key);
  for (const [target, kws] of Object.entries(HEURISTICS)) {
    if (!fields.includes(target)) continue;
    if (kws.some((kw) => norm === kw)) return target;
  }
  for (const [target, kws] of Object.entries(HEURISTICS)) {
    if (!fields.includes(target)) continue;
    if (kws.some((kw) => norm.includes(kw))) return target;
  }
  return null;
}

function inferType(samples: string[]): DataType {
  const vals = samples.map((s) => (s ?? "").toString().trim()).filter(Boolean).slice(0, 25);
  if (!vals.length) return "text";
  const isBool = vals.every((v) => /^(yes|no|y|n|true|false|0|1|t|f)$/i.test(v));
  if (isBool) return "boolean";
  const isNum = vals.every((v) => /^-?\d+([.,]\d+)?$/.test(v.replace(/[$,\s]/g, "")));
  if (isNum) return "number";
  const isDate = vals.every((v) => !isNaN(new Date(v).getTime()) && /[\d]{1,4}[-/.][\d]{1,2}/.test(v));
  if (isDate) return "date";
  return "text";
}

type ParsedFile = { headers: string[]; rows: Record<string, string>[] };

function isAiDoc(file: File): boolean {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf") || n.endsWith(".docx")) return true;
  return (
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return parseCsvText(await file.text());
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
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
  return parseCsvText(await file.text());
}

function parseCsvText(text: string): ParsedFile {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = res.meta.fields ?? [];
  const rows = (res.data ?? []).map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = String(r[h] ?? "").trim();
    return out;
  });
  return { headers, rows };
}

type Step = "upload" | "review";

type MappingEntry =
  | { kind: "core"; target: string }
  | { kind: "custom"; label: string; data_type: DataType; skip: boolean }
  | { kind: "skip" };

const TYPE_LABEL: Record<DataType, string> = {
  text: "Text Box Added",
  number: "Number Field Added",
  boolean: "Yes/No Toggle Added",
  date: "Date Picker Added",
};

export function BulkImporter({
  organizationId,
  defaultKind,
}: {
  organizationId: string | undefined;
  defaultKind: Kind;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [mode, setMode] = useState<"sheet" | "pdf">("sheet");
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, MappingEntry>>({});
  const [pasteText, setPasteText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const importFn = useServerFn(bulkImportRoster);
  const qc = useQueryClient();

  const reset = useCallback(() => {
    setStep("upload");
    setParsed(null);
    setMapping({});
    setPasteText("");
  }, []);

  const ingest = useCallback((p: ParsedFile) => {
    setParsed(p);
    const m: Record<string, MappingEntry> = {};
    for (const h of p.headers) {
      const core = aiGuessCore(h, kind);
      if (core) {
        m[h] = { kind: "core", target: core };
      } else {
        const samples = p.rows.slice(0, 25).map((r) => r[h] ?? "");
        m[h] = { kind: "custom", label: h.trim(), data_type: inferType(samples), skip: false };
      }
    }
    setMapping(m);
    setStep("review");
  }, [kind]);

  const handleFile = useCallback(async (file: File) => {
    try {
      const p = await parseFile(file);
      if (!p.rows.length) throw new Error("No rows found in file");
      ingest(p);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [ingest]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }, [handleFile]);

  const mappedCore = useMemo(
    () => Object.entries(mapping).filter(([, m]) => m.kind === "core") as [string, Extract<MappingEntry, { kind: "core" }>][],
    [mapping]
  );
  const autoCustom = useMemo(
    () => Object.entries(mapping).filter(([, m]) => m.kind === "custom") as [string, Extract<MappingEntry, { kind: "custom" }>][],
    [mapping]
  );

  const finalize = useCallback(async () => {
    if (!organizationId || !parsed) { toast.error("No organization context"); return; }
    setSubmitting(true);
    try {
      const activeCustom = autoCustom.filter(([, m]) => !m.skip);
      const rows = parsed.rows.map((r) => {
        const out: Record<string, string> = {};
        for (const [header, m] of mappedCore) {
          const val = (r[header] ?? "").toString().trim();
          const target = m.target;
          if (out[target]) out[target] = `${out[target]} ${val}`.trim();
          else out[target] = val;
        }
        for (const [header] of activeCustom) {
          out[`__custom__${header}`] = (r[header] ?? "").toString().trim();
        }
        return out;
      });
      const customFields = activeCustom.map(([header, m]) => ({
        header,
        label: m.label,
        data_type: m.data_type,
      }));
      const res = await importFn({ data: { kind, organizationId, rows, customFields } });
      toast.success(`Created ${res.created} ${kind}s · ${res.teamsCreated} new teams · ${res.customFieldsCreated} custom fields${res.errors.length ? ` · ${res.errors.length} skipped` : ""}`);
      if (res.errors.length) console.warn("Import errors:", res.errors);
      qc.invalidateQueries();
      setOpen(false);
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [importFn, kind, organizationId, parsed, mappedCore, autoCustom, qc, reset]);

  const coreFieldLabel = (key: string) =>
    CORE_FIELDS[kind].find((f) => f.key === key)?.label ?? key;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/5">
          <Sparkles className="mr-2 h-4 w-4" /> NECTAR Bulk Import (CSV, Excel, or PDF)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> NECTAR Bulk Importer</DialogTitle>
          <DialogDescription>
            Drop your roster — NECTAR auto-maps known fields and spins up custom attributes for anything new.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border p-1 w-fit">
          <button
            type="button"
            onClick={() => setKind("employee")}
            className={`px-3 py-1.5 text-sm rounded-md transition ${kind === "employee" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >Employee Roster</button>
          <button
            type="button"
            onClick={() => setKind("client")}
            className={`px-3 py-1.5 text-sm rounded-md transition ${kind === "client" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >Client Roster</button>
        </div>

        {kind === "client" && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-1 w-fit">
            <button
              type="button"
              onClick={() => setMode("sheet")}
              className={`inline-flex h-9 min-w-[44px] items-center gap-1.5 px-3 text-xs rounded-md transition ${mode === "sheet" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV / Excel
            </button>
            <button
              type="button"
              onClick={() => setMode("pdf")}
              className={`inline-flex h-9 min-w-[44px] items-center gap-1.5 px-3 text-xs rounded-md transition ${mode === "pdf" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Sparkles className="h-3.5 w-3.5" /> AI PDF Import
            </button>
          </div>
        )}

        {kind === "client" && mode === "pdf" ? (
          <AiPdfImporter
            organizationId={organizationId}
            onDone={() => setOpen(false)}
          />
        ) : (
          <>
        {step === "upload" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">Drop CSV / Excel here</p>
                <p className="text-xs text-muted-foreground">.csv, .xlsx, .xls supported · NECTAR auto-builds custom fields</p>
              </div>
              <Label htmlFor="bulk-file" className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm hover:bg-secondary/80">
                  <FileSpreadsheet className="h-4 w-4" /> Browse files
                </span>
                <input
                  id="bulk-file"
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
                />
              </Label>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Or paste CSV / table data</Label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                className="w-full rounded-md border bg-background p-2 text-sm font-mono"
                placeholder={"full_name,email,facility,shirt_size\nJane Doe,jane@x.com,Canyon View,Large"}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!pasteText.trim()}
                onClick={() => {
                  try {
                    const p = parseCsvText(pasteText);
                    if (!p.rows.length) throw new Error("Could not parse rows");
                    ingest(p);
                  } catch (e) { toast.error((e as Error).message); }
                }}
              >Parse pasted data</Button>
            </div>
          </div>
        )}

        {step === "review" && parsed && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              Detected <Badge variant="secondary">{parsed.headers.length} columns</Badge>{" "}
              <Badge variant="secondary">{parsed.rows.length} rows</Badge>{" "}
              <Badge variant="secondary">{mappedCore.length} core matches</Badge>{" "}
              <Badge className="bg-primary/10 text-primary border-primary/30" variant="outline">
                <Wand2 className="mr-1 h-3 w-3" /> {autoCustom.filter(([, m]) => !m.skip).length} auto-generated
              </Badge>
            </div>

            {mappedCore.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  ✅ Mapped Core Fields
                </p>
                <ul className="rounded-lg border divide-y">
                  {mappedCore.map(([header, m]) => (
                    <li key={header} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="truncate"><span className="font-medium">{header}</span> <span className="text-muted-foreground">→ {coreFieldLabel(m.target)}</span></span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {autoCustom.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  ✨ Auto-Generated Fields
                </p>
                <ul className="rounded-lg border divide-y">
                  {autoCustom.map(([header, m]) => (
                    <li key={header} className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${m.skip ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{m.label}</div>
                        <div className="text-xs text-muted-foreground">{TYPE_LABEL[m.data_type]}</div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                        <Switch
                          checked={m.skip}
                          onCheckedChange={(v) => setMapping((cur) => ({ ...cur, [header]: { ...(cur[header] as Extract<MappingEntry, { kind: "custom" }>), skip: v } }))}
                        />
                        Don't Import
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <details className="rounded-lg border bg-muted/20 p-2 text-xs">
              <summary className="cursor-pointer px-1 py-0.5 text-muted-foreground">Preview first 3 rows</summary>
              <div className="mt-2 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {parsed.headers.map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 3).map((r, i) => (
                      <TableRow key={i}>
                        {parsed.headers.map((h) => <TableCell key={h} className="text-xs">{r[h] || "—"}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={finalize} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                ⚡ Finalize & Populate Roster
              </Button>
            </DialogFooter>
          </div>
        )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

