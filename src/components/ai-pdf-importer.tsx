import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Sparkles,
  Upload,
  X,
  FileText,
  CheckCircle2,
  Trash2,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  extractClientFromPdf,
  extractClientFromDocx,
  commitClientFromPdf,
  type ExtractedClient,
} from "@/lib/pdf-import.functions";
import { EVV_SERVICE_CODES, evvServiceLabel } from "@/lib/evv-codes";
import { Checkbox } from "@/components/ui/checkbox";

const ACCEPT_EXT = [".pdf", ".docx"];
const ACCEPT_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPT_EXT.some((ext) => name.endsWith(ext)) || ACCEPT_MIME.includes(file.type);
}

function isDocx(file: File): boolean {
  return file.name.toLowerCase().endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function emptyData(): ExtractedClient {
  return {
    first_name: "",
    last_name: "",
    preferred_name: null,
    medicaid_id: "",
    date_of_birth: "",
    phone_number: null,
    physical_address: null,
    guardian_name: null,
    guardian_phone: null,
    guardian_relationship: null,
    guardian_legal_status: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_secondary_name: null,
    emergency_contact_secondary_phone: null,
    authorized_codes: [],
    billing_codes: [],
    medications: [],
    pcsp_goals: [],
    special_directions: null,
    bc_tier: null,
    assigned_behaviorist: null,
    prompting_levels: [],
    additional_sections: [],
  };
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function FromPcspBadge() {
  return (
    <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[9px] font-medium uppercase tracking-wider">
      <Sparkles className="mr-0.5 h-2.5 w-2.5" /> from PCSP
    </Badge>
  );
}

function FieldRow({
  label,
  value,
  filled,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  filled: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="grid gap-1">
      <Label className="flex items-center text-[11px] text-muted-foreground">
        {label}
        {filled ? <FromPcspBadge /> : null}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );
}

export function AiPdfImporter({
  organizationId,
  onDone,
  initialFile,
}: {
  organizationId: string | undefined;
  onDone: () => void;
  initialFile?: File | null;
}) {
  const extractFn = useServerFn(extractClientFromPdf);
  const extractDocxFn = useServerFn(extractClientFromDocx);
  const commitFn = useServerFn(commitClientFromPdf);
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [data, setData] = useState<ExtractedClient | null>(null);
  const [original, setOriginal] = useState<ExtractedClient | null>(null);
  // Default: every additional section is checked (will be created on save).
  const [sectionChecked, setSectionChecked] = useState<Record<number, boolean>>({});

  const reset = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setFileObj(null);
    setData(null);
    setOriginal(null);
    setSectionChecked({});
  }, [pdfUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!isAcceptedFile(file)) {
        toast.error("PCSP import accepts PDF or DOCX files only.");
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        toast.error("File is larger than 15 MB — please split or compress it.");
        return;
      }
      reset();
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setFileObj(file);
      setExtracting(true);

      try {
        const b64 = await fileToBase64(file);
        const result = isDocx(file)
          ? await extractDocxFn({ data: { docxBase64: b64 } })
          : await extractFn({ data: { pdfBase64: b64 } });
        setData(result);
        setOriginal(structuredClone(result));
        // Default-check every additional section.
        const initialChecks: Record<number, boolean> = {};
        (result.additional_sections ?? []).forEach((_, i) => { initialChecks[i] = true; });
        setSectionChecked(initialChecks);
        toast.success("NECTAR extraction complete — review before saving.");
      } catch (e) {
        toast.error((e as Error).message);
        URL.revokeObjectURL(url);
        setPdfUrl(null);
        setFileObj(null);
      } finally {
        setExtracting(false);
      }
    },
    [extractFn, extractDocxFn, reset],
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

  const wasFilled = useCallback(
    (key: keyof ExtractedClient): boolean => {
      const v = original?.[key];
      if (v == null) return false;
      if (typeof v === "string") return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    },
    [original],
  );

  const finalize = useCallback(async () => {
    if (!data || !organizationId || !fileObj) return;
    if (!data.first_name.trim() || !data.last_name.trim()) {
      toast.error("First and last name are required.");
      return;
    }
    setCommitting(true);
    try {
      // Upload the PCSP to storage with a stable path so re-uploads overwrite the same object.
      // The DB-side dedupe in commitClientFromPdf will then update the single client_documents row.
      const ext = fileObj.name.split(".").pop()?.toLowerCase() ?? "pdf";
      // We don't yet know the client id (may be created here) — use a content-stable
      // path that's still org/client scoped after we resolve the client id below.
      // To keep it simple, upload to a per-org tmp path; commit() rewrites the
      // client_documents row regardless of storage path. We use upsert:true so the
      // same admin re-uploading the same filename overwrites instead of duplicating.
      const safeName = fileObj.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${organizationId}/pcsp-import/${data.medicaid_id || `${data.first_name}_${data.last_name}`}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, fileObj, { upsert: true, contentType: fileObj.type || "application/pdf" });
      if (upErr) throw upErr;

      // Build accepted additional sections — only checked rows are persisted.
      const accepted = data.additional_sections.filter((_, i) => sectionChecked[i] !== false);

      const res = await commitFn({
        data: {
          organizationId,
          client: {
            first_name: data.first_name.trim(),
            last_name: data.last_name.trim(),
            medicaid_id: data.medicaid_id.trim(),
            date_of_birth: data.date_of_birth?.trim() || null,
            phone_number: data.phone_number?.trim() || null,
            physical_address: data.physical_address?.trim() || null,
            emergency_contact_name: data.emergency_contact_name?.trim() || null,
            emergency_contact_phone: data.emergency_contact_phone?.trim() || null,
            special_directions: data.special_directions?.trim() || null,
            pcsp_goals: data.pcsp_goals.map((g) => g.trim()).filter(Boolean),
            authorized_codes: data.authorized_codes,
            billing_codes: data.billing_codes,
            medications: data.medications.filter((m) => m.medication_name.trim()),
          },
          additionalSections: accepted,
          pcspDocument: {
            storagePath: path,
            fileName: fileObj.name,
            fileSizeBytes: fileObj.size,
          },
        },
      });
      const n = res.fieldCount ?? 0;
      toast.success(
        `${res.created ? "Client created" : "Client profile updated"} — NECTAR filled ${n} field${n === 1 ? "" : "s"} from the PCSP.`,
      );
      qc.invalidateQueries();
      reset();
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }, [data, organizationId, fileObj, commitFn, qc, reset, onDone, sectionChecked]);

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
            extracting
              ? "border-primary/60 bg-primary/5"
              : dragging
                ? "border-primary bg-primary/5"
                : "border-primary/30"
          }`}
        >
          {extracting ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div>
                <p className="font-medium tracking-tight">
                  NECTAR is reading every field in the PCSP…
                </p>
                <p className="text-xs text-muted-foreground">
                  Identity, contact, guardian, billing codes, medications, goals, clinical alerts, and anything else
                  in the document.
                </p>
              </div>
            </>
          ) : (
            <>
              <Sparkles className="h-10 w-10 text-primary" />
              <div>
                <p className="font-medium">Drop a PCSP, roster, or assessment — PDF or DOCX</p>
                <p className="text-xs text-muted-foreground">
                  NECTAR extracts every field present in the document and prompts you to create new sections
                  for anything that doesn't have a matching field. Nothing is ever invented.
                </p>
              </div>
              <Label htmlFor="ai-pdf-file" className="cursor-pointer">
                <span className="inline-flex h-11 min-w-[44px] items-center gap-2 rounded-md border border-primary/40 bg-secondary px-3 py-2 text-sm hover:bg-secondary/80">
                  <Upload className="h-4 w-4" /> Browse file
                </span>
                <input
                  id="ai-pdf-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
          PDF files up to 15 MB. Re-uploading the same client's PCSP updates the existing record — it does not duplicate.
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
    setData((cur) =>
      cur ? { ...cur, pcsp_goals: cur.pcsp_goals.filter((_, i) => i !== idx) } : cur,
    );
  const addGoal = () =>
    setData((cur) => (cur ? { ...cur, pcsp_goals: [...cur.pcsp_goals, ""] } : cur));

  const filledCount =
    (original
      ? (
          [
            "first_name",
            "last_name",
            "medicaid_id",
            "date_of_birth",
            "phone_number",
            "physical_address",
            "guardian_name",
            "guardian_phone",
            "emergency_contact_name",
            "emergency_contact_phone",
            "special_directions",
            "bc_tier",
            "assigned_behaviorist",
            "authorized_codes",
            "billing_codes",
            "medications",
            "pcsp_goals",
          ] as (keyof ExtractedClient)[]
        ).filter((k) => wasFilled(k)).length
      : 0) + (original?.additional_sections.length ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          NECTAR extracted {filledCount} field{filledCount === 1 ? "" : "s"} from the PCSP — review and confirm
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="h-9">
          <X className="h-4 w-4" /> Discard
        </Button>
      </div>

      {/* Compact file reference (no inline embed/iframe). */}
      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium text-foreground">{fileObj?.name || "Source document"}</span>
        </span>
        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2.5 text-xs hover:bg-muted"
          >
            Open
          </a>
        ) : null}
      </div>

      <div className="grid gap-4">
        {/* Editable extracted data */}
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Identity
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                label="First name *"
                value={data.first_name}
                filled={wasFilled("first_name")}
                onChange={(v) => setField("first_name", v)}
              />
              <FieldRow
                label="Last name *"
                value={data.last_name}
                filled={wasFilled("last_name")}
                onChange={(v) => setField("last_name", v)}
              />
              <FieldRow
                label="Medicaid ID"
                value={data.medicaid_id}
                filled={wasFilled("medicaid_id")}
                onChange={(v) => setField("medicaid_id", v.replace(/\D+/g, ""))}
                placeholder="0000000000"
              />
              <FieldRow
                label="Date of birth"
                value={data.date_of_birth}
                filled={wasFilled("date_of_birth")}
                onChange={(v) => setField("date_of_birth", v)}
                placeholder="YYYY-MM-DD"
              />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Contact
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                label="Phone"
                value={data.phone_number ?? ""}
                filled={wasFilled("phone_number")}
                onChange={(v) => setField("phone_number", v)}
              />
              <FieldRow
                label="Service address"
                value={data.physical_address ?? ""}
                filled={wasFilled("physical_address")}
                onChange={(v) => setField("physical_address", v)}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Guardian / legal
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                label="Guardian name"
                value={data.guardian_name ?? ""}
                filled={wasFilled("guardian_name")}
                onChange={(v) => setField("guardian_name", v)}
              />
              <FieldRow
                label="Guardian phone"
                value={data.guardian_phone ?? ""}
                filled={wasFilled("guardian_phone")}
                onChange={(v) => setField("guardian_phone", v)}
              />
              <FieldRow
                label="Relationship"
                value={data.guardian_relationship ?? ""}
                filled={wasFilled("guardian_relationship")}
                onChange={(v) => setField("guardian_relationship", v)}
              />
              <FieldRow
                label="Legal status"
                value={data.guardian_legal_status ?? ""}
                filled={wasFilled("guardian_legal_status")}
                onChange={(v) => setField("guardian_legal_status", v)}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Emergency contact
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow
                label="Primary name"
                value={data.emergency_contact_name ?? ""}
                filled={wasFilled("emergency_contact_name")}
                onChange={(v) => setField("emergency_contact_name", v)}
              />
              <FieldRow
                label="Primary phone"
                value={data.emergency_contact_phone ?? ""}
                filled={wasFilled("emergency_contact_phone")}
                onChange={(v) => setField("emergency_contact_phone", v)}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Authorized service codes
              {wasFilled("authorized_codes") ? <FromPcspBadge /> : null}{" "}
              <span className="text-muted-foreground">({data.authorized_codes.length} selected)</span>
            </h4>
            <div className="max-h-32 overflow-y-auto rounded-md border p-2">
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
          </section>

          {data.billing_codes.length > 0 && (
            <section className="space-y-2">
              <h4 className="flex items-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Billing codes detail
                <FromPcspBadge />
              </h4>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Code</th>
                      <th className="px-2 py-1 text-left font-medium">Rate / unit</th>
                      <th className="px-2 py-1 text-left font-medium">Annual units</th>
                      <th className="px-2 py-1 text-left font-medium">Start</th>
                      <th className="px-2 py-1 text-left font-medium">End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.billing_codes.map((r, i) => (
                      <tr key={`${r.service_code}-${i}`} className="border-t">
                        <td className="px-2 py-1 font-mono">{r.service_code}</td>
                        <td className="px-2 py-1">{r.rate_per_unit ?? "—"}</td>
                        <td className="px-2 py-1">{r.annual_units ?? "—"}</td>
                        <td className="px-2 py-1">{r.service_start_date ?? "—"}</td>
                        <td className="px-2 py-1">{r.service_end_date ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.medications.length > 0 && (
            <section className="space-y-2">
              <h4 className="flex items-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Medications
                <FromPcspBadge />
                <span className="ml-2 text-muted-foreground">({data.medications.length})</span>
              </h4>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Name</th>
                      <th className="px-2 py-1 text-left font-medium">Dose</th>
                      <th className="px-2 py-1 text-left font-medium">Route</th>
                      <th className="px-2 py-1 text-left font-medium">Frequency</th>
                      <th className="px-2 py-1 text-left font-medium">Prescriber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.medications.map((m, i) => (
                      <tr key={`${m.medication_name}-${i}`} className="border-t">
                        <td className="px-2 py-1 font-medium">{m.medication_name}</td>
                        <td className="px-2 py-1">{m.dosage ?? "—"}</td>
                        <td className="px-2 py-1">{m.route ?? "—"}</td>
                        <td className="px-2 py-1">{m.frequency ?? "—"}</td>
                        <td className="px-2 py-1">{m.prescriber ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                PCSP goals
                {wasFilled("pcsp_goals") ? <FromPcspBadge /> : null}
                <span className="ml-2 text-muted-foreground">({data.pcsp_goals.length})</span>
              </h4>
              <Button type="button" variant="ghost" size="sm" onClick={addGoal} className="h-7">
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {data.pcsp_goals.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No goals extracted.
                </p>
              ) : (
                data.pcsp_goals.map((g, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Textarea
                      value={g}
                      rows={2}
                      onChange={(e) => updateGoal(i, e.target.value)}
                      className="text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeGoal(i)}
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove goal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>

          {(data.special_directions || wasFilled("special_directions")) && (
            <section className="space-y-2">
              <h4 className="flex items-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Special directions & clinical alerts
                {wasFilled("special_directions") ? <FromPcspBadge /> : null}
              </h4>
              <Textarea
                rows={4}
                value={data.special_directions ?? ""}
                onChange={(e) => setField("special_directions", e.target.value)}
                className="text-xs"
              />
            </section>
          )}

          {(data.bc_tier || data.assigned_behaviorist) && (
            <section className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Behavior support
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow
                  label="BC tier"
                  value={data.bc_tier ?? ""}
                  filled={wasFilled("bc_tier")}
                  onChange={(v) => setField("bc_tier", v)}
                />
                <FieldRow
                  label="Assigned behaviorist"
                  value={data.assigned_behaviorist ?? ""}
                  filled={wasFilled("assigned_behaviorist")}
                  onChange={(v) => setField("assigned_behaviorist", v)}
                />
              </div>
            </section>
          )}

          {data.additional_sections.length > 0 && (() => {
            const total = data.additional_sections.length;
            const checkedCount = data.additional_sections.reduce(
              (n, _, i) => n + (sectionChecked[i] !== false ? 1 : 0),
              0,
            );
            const allChecked = checkedCount === total;
            return (
              <section className="space-y-2">
                <div className="rounded-md border border-amber-400/40 bg-amber-50/40 p-3 dark:bg-amber-950/20">
                  <h4 className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Additional information found in this document
                  </h4>
                  <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">
                    Check each block you want NECTAR to save as a new section on this client's profile.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[11px] text-muted-foreground">
                    {checkedCount} of {total} selected
                  </span>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-primary hover:underline"
                    onClick={() => {
                      const next: Record<number, boolean> = {};
                      data.additional_sections.forEach((_, i) => { next[i] = !allChecked; });
                      setSectionChecked(next);
                    }}
                  >
                    {allChecked ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="space-y-2">
                  {data.additional_sections.map((s, i) => {
                    const checked = sectionChecked[i] !== false;
                    return (
                      <label
                        key={i}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                          checked ? "border-primary/40 bg-primary/5" : "border-border bg-background opacity-70"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setSectionChecked((d) => ({ ...d, [i]: v === true }))
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{s.label}</div>
                          <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                            {s.content}
                          </pre>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })()}
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
          Confirm &amp; save to profile
        </Button>
      </div>
    </div>
  );
}
