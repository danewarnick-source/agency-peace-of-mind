import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sparkles, Upload, FileSpreadsheet, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { bulkImportRoster } from "@/lib/bulk-import.functions";
import { useQueryClient } from "@tanstack/react-query";

type Kind = "employee" | "client";

const TARGET_FIELDS: Record<Kind, { key: string; label: string; required?: boolean }[]> = {
  employee: [
    { key: "__skip", label: "— Ignore —" },
    { key: "full_name", label: "Full Name", required: true },
    { key: "first_name", label: "First Name" },
    { key: "last_name", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "position", label: "Position / Title" },
    { key: "hire_date", label: "Hire Date" },
    { key: "team_name", label: "Facility / Program (→ team)" },
  ],
  client: [
    { key: "__skip", label: "— Ignore —" },
    { key: "first_name", label: "First Name", required: true },
    { key: "last_name", label: "Last Name", required: true },
    { key: "full_name", label: "Full Name (split)" },
    { key: "phone", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "medicaid_id", label: "Medicaid ID" },
    { key: "job_code", label: "Job Codes" },
    { key: "team_name", label: "Facility / Program (→ team)" },
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
  job_code: ["job code", "code", "service code", "auth code"],
};

function aiGuess(header: string, kind: Kind): string {
  const norm = header.toLowerCase().trim();
  const fields = TARGET_FIELDS[kind].map((f) => f.key);
  // exact
  for (const [target, kws] of Object.entries(HEURISTICS)) {
    if (!fields.includes(target)) continue;
    if (kws.some((kw) => norm === kw)) return target;
  }
  // contains
  for (const [target, kws] of Object.entries(HEURISTICS)) {
    if (!fields.includes(target)) continue;
    if (kws.some((kw) => norm.includes(kw))) return target;
  }
  return "__skip";
}

type ParsedFile = { headers: string[]; rows: Record<string, string>[] };

async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    return parseCsvText(text);
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
  if (name.endsWith(".pdf")) {
    throw new Error("PDF parsing isn't supported in-browser yet. Paste your data as CSV in the textarea below, or export your PDF to Excel/CSV first.");
  }
  // fallback: try CSV
  const text = await file.text();
  return parseCsvText(text);
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

type Step = "upload" | "map" | "review";

export function BulkImporter({
  organizationId,
  defaultKind,
}: {
  organizationId: string | undefined;
  defaultKind: Kind;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [reviewRows, setReviewRows] = useState<Record<string, string>[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const importFn = useServerFn(bulkImportRoster);
  const qc = useQueryClient();

  const reset = useCallback(() => {
    setStep("upload");
    setParsed(null);
    setMapping({});
    setReviewRows([]);
    setPasteText("");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    try {
      const p = await parseFile(file);
      if (!p.rows.length) throw new Error("No rows found in file");
      setParsed(p);
      const m: Record<string, string> = {};
      for (const h of p.headers) m[h] = aiGuess(h, kind);
      setMapping(m);
      setStep("map");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [kind]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }, [handleFile]);

  const proceedToReview = useCallback(() => {
    if (!parsed) return;
    const rows = parsed.rows.map((r) => {
      const out: Record<string, string> = {};
      for (const [header, target] of Object.entries(mapping)) {
        if (!target || target === "__skip") continue;
        const val = (r[header] ?? "").toString().trim();
        // merge if same target mapped twice
        if (out[target]) out[target] = `${out[target]} ${val}`.trim();
        else out[target] = val;
      }
      return out;
    });
    setReviewRows(rows);
    setStep("review");
  }, [parsed, mapping]);

  const requiredKeys = TARGET_FIELDS[kind].filter((f) => f.required).map((f) => f.key);
  const isRowInvalid = (row: Record<string, string>, key: string) =>
    requiredKeys.includes(key) && !row[key]?.trim();

  const finalize = useCallback(async () => {
    if (!organizationId) { toast.error("No organization context"); return; }
    setSubmitting(true);
    try {
      const res = await importFn({ data: { kind, organizationId, rows: reviewRows } });
      toast.success(`Created ${res.created} ${kind}s · ${res.teamsCreated} new teams${res.errors.length ? ` · ${res.errors.length} skipped` : ""}`);
      if (res.errors.length) console.warn("Import errors:", res.errors);
      qc.invalidateQueries();
      setOpen(false);
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [importFn, kind, organizationId, reviewRows, qc, reset]);

  // mapped target keys used (for review grid columns)
  const reviewColumns = useMemo(() => {
    const set = new Set<string>();
    for (const t of Object.values(mapping)) if (t && t !== "__skip") set.add(t);
    return Array.from(set);
  }, [mapping]);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-primary/40 text-primary hover:bg-primary/5">
          <Sparkles className="mr-2 h-4 w-4" /> AI Bulk Import (CSV, Excel, or PDF)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Bulk Importer</DialogTitle>
          <DialogDescription>
            Upload your roster — we'll auto-map columns and route people to the right facility.
          </DialogDescription>
        </DialogHeader>

        {/* Type toggle */}
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
                <p className="text-xs text-muted-foreground">.csv, .xlsx, .xls supported</p>
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
              <Label className="text-xs text-muted-foreground">Or paste CSV / table data (great for PDF copy-paste)</Label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                className="w-full rounded-md border bg-background p-2 text-sm font-mono"
                placeholder={"full_name,email,facility\nJane Doe,jane@x.com,Canyon View"}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!pasteText.trim()}
                onClick={() => {
                  try {
                    const p = parseCsvText(pasteText);
                    if (!p.rows.length) throw new Error("Could not parse rows");
                    setParsed(p);
                    const m: Record<string, string> = {};
                    for (const h of p.headers) m[h] = aiGuess(h, kind);
                    setMapping(m);
                    setStep("map");
                  } catch (e) { toast.error((e as Error).message); }
                }}
              >Parse pasted data</Button>
            </div>
          </div>
        )}

        {step === "map" && parsed && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Detected <Badge variant="secondary">{parsed.headers.length} columns</Badge> and{" "}
                <Badge variant="secondary">{parsed.rows.length} rows</Badge>. Confirm AI mapping below.
              </p>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Column</TableHead>
                    <TableHead>Sample</TableHead>
                    <TableHead className="w-[260px]">Maps to →</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.headers.map((h) => (
                    <TableRow key={h}>
                      <TableCell className="font-medium">{h}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {parsed.rows[0]?.[h] || "—"}
                      </TableCell>
                      <TableCell>
                        <Select value={mapping[h]} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TARGET_FIELDS[kind].map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {f.label}{f.required ? " *" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={proceedToReview}>
                Continue to review <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Review & edit. Missing required fields are highlighted in <span className="rounded bg-rose-100 px-1 text-rose-700 dark:bg-rose-950 dark:text-rose-300">crimson</span>.
            </p>
            <div className="max-h-[400px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {reviewColumns.map((c) => {
                      const meta = TARGET_FIELDS[kind].find((f) => f.key === c);
                      return <TableHead key={c}>{meta?.label ?? c}{meta?.required ? " *" : ""}</TableHead>;
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewRows.map((row, idx) => (
                    <TableRow key={idx}>
                      {reviewColumns.map((c) => (
                        <TableCell key={c} className="p-1">
                          <Input
                            value={row[c] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setReviewRows((rs) => rs.map((r, i) => i === idx ? { ...r, [c]: v } : r));
                            }}
                            className={`h-8 text-xs ${isRowInvalid(row, c) ? "bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800" : ""}`}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("map")}>Back</Button>
              <Button onClick={finalize} disabled={submitting || !reviewRows.length}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Finalize & Populate Roster
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
