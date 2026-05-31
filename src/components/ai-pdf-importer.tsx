import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Upload, X, FileText, CheckCircle2, Trash2, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  extractClientFromPdf,
  commitClientFromPdf,
  type ExtractedClient,
} from "@/lib/pdf-import.functions";
import { EVV_SERVICE_CODES, evvServiceLabel } from "@/lib/evv-codes";

type RouteTarget =
  | "first_name"
  | "last_name"
  | "medicaid_id"
  | "date_of_birth"
  | "pcsp_goal"
  | "discard";

const ROUTE_OPTIONS: { value: RouteTarget; label: string }[] = [
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "medicaid_id", label: "Individual Medicaid ID" },
  { value: "date_of_birth", label: "Date of Birth (YYYY-MM-DD)" },
  { value: "pcsp_goal", label: "Append as PCSP Goal" },
  { value: "discard", label: "Discard / Ignore" },
];

type UnresolvedItem = { id: string; text: string; reason: string };

const ACCEPT_EXT = [".pdf", ".docx", ".png"];
const ACCEPT_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
];

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    ACCEPT_EXT.some((ext) => name.endsWith(ext)) ||
    ACCEPT_MIME.includes(file.type)
  );
}

function detectAmbiguities(d: ExtractedClient): UnresolvedItem[] {
  const out: UnresolvedItem[] = [];
  if (d.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(d.date_of_birth.trim())) {
    out.push({
      id: `dob-${Date.now()}`,
      text: d.date_of_birth.trim(),
      reason: "Ambiguous date format detected by the Nectar engine.",
    });
  }
  if (d.medicaid_id && (d.medicaid_id.length < 8 || d.medicaid_id.length > 12)) {
    out.push({
      id: `med-${Date.now()}`,
      text: d.medicaid_id,
      reason: "Medicaid ID length is outside the expected 8–12 digit range.",
    });
  }
  return out;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  // Convert in chunks to avoid call-stack overflow on large PDFs
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function AiPdfImporter({
  organizationId,
  onDone,
}: {
  organizationId: string | undefined;
  onDone: () => void;
}) {
  const extractFn = useServerFn(extractClientFromPdf);
  const commitFn = useServerFn(commitClientFromPdf);
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [data, setData] = useState<ExtractedClient | null>(null);

  const reset = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setData(null);
  }, [pdfUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        toast.error("Please upload a PDF file.");
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error("PDF is larger than 15 MB — please split or compress it.");
        return;
      }
      reset();
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setExtracting(true);
      try {
        const b64 = await fileToBase64(file);
        const result = await extractFn({ data: { pdfBase64: b64 } });
        setData(result);
        toast.success("AI extraction complete — review before saving.");
      } catch (e) {
        toast.error((e as Error).message);
        URL.revokeObjectURL(url);
        setPdfUrl(null);
      } finally {
        setExtracting(false);
      }
    },
    [extractFn, reset],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  const finalize = useCallback(async () => {
    if (!data || !organizationId) return;
    if (!data.first_name.trim() || !data.last_name.trim()) {
      toast.error("First and last name are required.");
      return;
    }
    setCommitting(true);
    try {
      const res = await commitFn({
        data: {
          organizationId,
          client: {
            first_name: data.first_name.trim(),
            last_name: data.last_name.trim(),
            medicaid_id: data.medicaid_id.trim(),
            pcsp_goals: data.pcsp_goals.map((g) => g.trim()).filter(Boolean),
            authorized_codes: data.authorized_codes,
          },
        },
      });
      toast.success(res.created ? "Client created from PCSP." : "Client profile updated from PCSP.");
      qc.invalidateQueries();
      reset();
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }, [data, organizationId, commitFn, qc, reset, onDone]);

  const codeSet = useMemo(() => new Set(data?.authorized_codes ?? []), [data]);

  // --- Upload state -------------------------------------------------
  if (!pdfUrl || !data) {
    return (
      <div className="space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          {extracting ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div>
                <p className="font-medium">AI is reading the PCSP…</p>
                <p className="text-xs text-muted-foreground">
                  Locating goals, Medicaid ID, and authorized service codes.
                </p>
              </div>
            </>
          ) : (
            <>
              <Sparkles className="h-10 w-10 text-primary" />
              <div>
                <p className="font-medium">Drop a PCSP / client-profile PDF</p>
                <p className="text-xs text-muted-foreground">
                  AI extracts identity, authorized codes, and goals — you review before saving.
                </p>
              </div>
              <Label htmlFor="ai-pdf-file" className="cursor-pointer">
                <span className="inline-flex h-11 min-w-[44px] items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm hover:bg-secondary/80">
                  <Upload className="h-4 w-4" /> Browse PDF
                </span>
                <input
                  id="ai-pdf-file"
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </Label>
            </>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          PDFs up to 15 MB. Scanned image-only PDFs are not yet supported.
        </p>
      </div>
    );
  }

  // --- Review state -------------------------------------------------
  const setField = <K extends keyof ExtractedClient>(k: K, v: ExtractedClient[K]) =>
    setData((cur) => (cur ? { ...cur, [k]: v } : cur));

  const toggleCode = (code: string) => {
    setData((cur) => {
      if (!cur) return cur;
      const has = cur.authorized_codes.includes(code);
      return {
        ...cur,
        authorized_codes: has
          ? cur.authorized_codes.filter((c) => c !== code)
          : [...cur.authorized_codes, code],
      };
    });
  };

  const updateGoal = (idx: number, val: string) =>
    setData((cur) =>
      cur ? { ...cur, pcsp_goals: cur.pcsp_goals.map((g, i) => (i === idx ? val : g)) } : cur,
    );
  const removeGoal = (idx: number) =>
    setData((cur) => (cur ? { ...cur, pcsp_goals: cur.pcsp_goals.filter((_, i) => i !== idx) } : cur));
  const addGoal = () =>
    setData((cur) => (cur ? { ...cur, pcsp_goals: [...cur.pcsp_goals, ""] } : cur));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Review &amp; Verify
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="h-9">
          <X className="h-4 w-4" /> Discard
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: PDF preview */}
        <div className="rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Uploaded PDF
          </div>
          <iframe
            title="PCSP preview"
            src={pdfUrl}
            className="h-[60vh] w-full rounded-b-lg bg-background"
          />
        </div>

        {/* Right: editable form */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">First name *</Label>
              <Input
                value={data.first_name}
                onChange={(e) => setField("first_name", e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Last name *</Label>
              <Input
                value={data.last_name}
                onChange={(e) => setField("last_name", e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Medicaid ID</Label>
              <Input
                value={data.medicaid_id}
                onChange={(e) => setField("medicaid_id", e.target.value.replace(/\D+/g, ""))}
                inputMode="numeric"
                className="h-11 font-mono"
                placeholder="0000000000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Date of birth</Label>
              <Input
                value={data.date_of_birth}
                onChange={(e) => setField("date_of_birth", e.target.value)}
                placeholder="YYYY-MM-DD"
                className="h-11"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">
              Authorized service codes{" "}
              <span className="text-muted-foreground">({data.authorized_codes.length} checked)</span>
            </Label>
            <div className="max-h-40 overflow-y-auto rounded-md border p-2">
              <div className="flex flex-wrap gap-1.5">
                {EVV_SERVICE_CODES.map((c) => {
                  const on = codeSet.has(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => toggleCode(c.code)}
                      className={`inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                      title={evvServiceLabel(c.code)}
                    >
                      {on ? <CheckCircle2 className="h-3 w-3" /> : null}
                      <span className="font-mono">{c.code}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">PCSP goals ({data.pcsp_goals.length})</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addGoal} className="h-8">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {data.pcsp_goals.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No goals extracted. Click Add to enter one manually.
                </p>
              ) : (
                data.pcsp_goals.map((g, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Textarea
                      value={g}
                      rows={2}
                      onChange={(e) => updateGoal(i, e.target.value)}
                      className="text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeGoal(i)}
                      className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove goal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {data.prompting_levels.length > 0 && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Prompting levels (informational)</Label>
              <div className="flex flex-wrap gap-1.5">
                {data.prompting_levels.map((p) => (
                  <Badge key={p} variant="secondary" className="text-[11px]">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={reset} disabled={committing} className="h-11">
          Cancel
        </Button>
        <Button onClick={finalize} disabled={committing} className="h-11">
          {committing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Finalize &amp; Save to Profile
        </Button>
      </div>
    </div>
  );
}
