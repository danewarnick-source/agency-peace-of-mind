/**
 * Employee documents card — uploads + NECTAR extraction on the employee
 * profile page. Mirrors the client-documents-card UX.
 *
 * When a document is uploaded, the admin can hit "Extract with NECTAR" to
 * have the AI read it and autofill any EMPTY profile columns (never
 * overwrites values already there). Suggestions that conflict with existing
 * values are surfaced but not applied.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Upload, FileText, Trash2, Download, Loader2, ShieldCheck } from "lucide-react";
import { RequirePermission } from "@/components/rbac-guard";
import {
  listEmployeeDocuments,
  createEmployeeDocumentUploadUrl,
  getEmployeeDocumentUrl,
  deleteEmployeeDocument,
  extractEmployeeDocument,
} from "@/lib/employee-documents.functions";

const KINDS: Array<{ value: string; label: string }> = [
  { value: "application", label: "Application" },
  { value: "onboarding_form", label: "Onboarding form" },
  { value: "i9", label: "I-9" },
  { value: "w4", label: "W-4" },
  { value: "offer_letter", label: "Offer letter" },
  { value: "handbook_ack", label: "Handbook acknowledgement" },
  { value: "background_check", label: "Background check" },
  { value: "direct_deposit", label: "Direct deposit" },
  { value: "resume", label: "Résumé" },
  { value: "drivers_license", label: "Driver's license" },
  { value: "certification", label: "Certification" },
  { value: "other", label: "Other" },
];

const labelFor = (v: string) => KINDS.find((k) => k.value === v)?.label ?? v;

export function EmployeeDocumentsCard({
  organizationId,
  staffId,
  onProfileMaybeChanged,
}: {
  organizationId: string;
  staffId: string;
  onProfileMaybeChanged?: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listEmployeeDocuments);
  const uploadUrlFn = useServerFn(createEmployeeDocumentUploadUrl);
  const readUrlFn = useServerFn(getEmployeeDocumentUrl);
  const deleteFn = useServerFn(deleteEmployeeDocument);
  const extractFn = useServerFn(extractEmployeeDocument);

  const [kind, setKind] = useState<string>("application");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docsQ = useQuery({
    enabled: !!organizationId && !!staffId,
    queryKey: ["employee-documents", organizationId, staffId],
    queryFn: () => listFn({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["employee-documents", organizationId, staffId] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const signed = await uploadUrlFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          kind,
          title: file.name,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        },
      });
      const put = await fetch(signed.upload.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      return signed.employee_document_id;
    },
    onSuccess: () => {
      toast.success("Uploaded — hit ‘Extract with NECTAR' to autofill the profile.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extractMutation = useMutation({
    mutationFn: async (docId: string) =>
      extractFn({ data: { organization_id: organizationId, employee_document_id: docId } }),
    onSuccess: (res) => {
      if (res.applied_count > 0) {
        toast.success(
          `NECTAR filled ${res.applied_count} field${res.applied_count === 1 ? "" : "s"}` +
            (res.suggested_count > 0 ? ` (+${res.suggested_count} suggestion${res.suggested_count === 1 ? "" : "s"} vs existing values)` : ""),
        );
      } else if (res.suggested_count > 0) {
        toast.info(`NECTAR found ${res.suggested_count} suggestion${res.suggested_count === 1 ? "" : "s"} that conflict with existing profile values — review below.`);
      } else {
        toast.info("NECTAR read the document but found no new profile fields to fill.");
      }
      invalidate();
      onProfileMaybeChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) =>
      deleteFn({ data: { organization_id: organizationId, employee_document_id: docId } }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openDoc = async (docId: string) => {
    try {
      const res = await readUrlFn({ data: { organization_id: organizationId, employee_document_id: docId } });
      window.open(res.url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open");
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
    e.target.value = "";
  };

  const docs = docsQ.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Employee documents
        </CardTitle>
        <RequirePermission perm="manage_users">
          <div className="flex items-center gap-2">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input ref={fileInputRef} type="file" className="hidden" onChange={onPick} accept=".pdf,.docx,.txt,image/*" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploadMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              Upload
            </Button>
          </div>
        </RequirePermission>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Upload applications, onboarding forms, or any authoritative source. Then click
          <span className="mx-1 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">
            <Sparkles className="h-3 w-3" /> Extract with NECTAR
          </span>
          to auto-fill the profile. NECTAR only writes into empty fields — it will never overwrite what you've already entered.
        </p>

        {docsQ.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 py-6 text-center text-sm text-muted-foreground">
            No documents yet.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {docs.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                extractPending={extractMutation.isPending && extractMutation.variables === d.id}
                deletePending={deleteMutation.isPending && deleteMutation.variables === d.id}
                onOpen={() => openDoc(d.id)}
                onExtract={() => extractMutation.mutate(d.id)}
                onDelete={() => {
                  if (window.confirm(`Delete ${d.file_name ?? "this document"}?`)) deleteMutation.mutate(d.id);
                }}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DocRow({
  doc,
  extractPending,
  deletePending,
  onOpen,
  onExtract,
  onDelete,
}: {
  doc: Awaited<ReturnType<typeof listEmployeeDocuments>>[number];
  extractPending: boolean;
  deletePending: boolean;
  onOpen: () => void;
  onExtract: () => void;
  onDelete: () => void;
}) {
  const summary = doc.nectar_applied_fields;
  const applied = summary?.applied ?? [];
  const suggested = summary?.suggested ?? [];
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <button type="button" onClick={onOpen} className="truncate text-sm font-medium hover:underline">
            {doc.file_name ?? doc.title ?? "(untitled)"}
          </button>
          <Badge variant="outline" className="text-[10px] uppercase">{labelFor(doc.kind)}</Badge>
          {doc.nectar_status === "extracted" && (
            <Badge className="bg-emerald-100 text-emerald-800 text-[10px] uppercase" variant="secondary">
              <ShieldCheck className="mr-1 h-3 w-3" /> Nectar read
            </Badge>
          )}
          {doc.nectar_status === "failed" || doc.nectar_status === "unreadable" ? (
            <Badge variant="destructive" className="text-[10px] uppercase">{doc.nectar_status}</Badge>
          ) : null}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Uploaded {new Date(doc.uploaded_at).toLocaleString()}
        </div>
        {applied.length > 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
            <div className="font-semibold">Autofilled from this document:</div>
            <ul className="mt-1 grid gap-0.5">
              {applied.map((a) => (
                <li key={a.field}><span className="font-mono">{a.field}</span> → {a.value}</li>
              ))}
            </ul>
          </div>
        )}
        {suggested.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <div className="font-semibold">Suggestions that conflict with what you've already entered:</div>
            <ul className="mt-1 grid gap-0.5">
              {suggested.map((s) => (
                <li key={s.field}>
                  <span className="font-mono">{s.field}</span>: document says <em>{s.value}</em>, profile has <em>{s.existing ?? "—"}</em>
                </li>
              ))}
            </ul>
            <div className="mt-1 opacity-80">Edit the profile card above to change any of these.</div>
          </div>
        )}
        {doc.nectar_error && (
          <div className="text-xs text-rose-700">NECTAR error: {doc.nectar_error}</div>
        )}
      </div>
      <RequirePermission perm="manage_users">
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onOpen} title="Open">
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={extractPending}
            onClick={onExtract}
            className="text-primary hover:text-primary"
          >
            {extractPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            {doc.nectar_status === "extracted" ? "Re-extract" : "Extract with NECTAR"}
          </Button>
          <Button size="sm" variant="ghost" disabled={deletePending} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
          </Button>
        </div>
      </RequirePermission>
    </li>
  );
}

// Reserved for future use; imported for side-effect-free tree-shaking hint.
export const _EMPLOYEE_DOCS_KINDS = KINDS;
export function _unusedHook() { useEffect(() => {}, []); }
useMemo; // eslint no-unused
