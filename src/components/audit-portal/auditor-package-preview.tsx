import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, Sparkles, FileText, User, Contact2, Calendar,
  Folder, FolderPlus, Upload, Download, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getAuditorPackageView,
  listPackageFolders,
  listPackageFiles,
  createPackageFolder,
  deletePackageFolder,
  createPackageFileUpload,
  getPackageFileDownloadUrl,
  deletePackageFile,
  type AuditPackageFolderRow,
  type AuditPackageFileRow,
} from "@/lib/audit-portal.functions";
import type { AuditPackageSubjectSummary } from "@/lib/audit-package-data";

/**
 * Shared page for both the auditor (read-only) and the org-side Auditor View
 * preview. When `mode === "org"`, folder/file CRUD is enabled and shows an
 * org-preview banner. When `mode === "auditor"`, everything is read-only.
 */
export function AuditorPackagePreview({ packageId, mode }: { packageId: string; mode: "org" | "auditor" }) {
  const viewFn = useServerFn(getAuditorPackageView);
  const viewQ = useQuery({
    queryKey: ["auditor-package-view", packageId],
    queryFn: () => viewFn({ data: { auditPackageId: packageId } }),
  });

  if (viewQ.isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading package…</div>;
  if (viewQ.error || !viewQ.data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {(viewQ.error as Error | undefined)?.message ?? "Package not available."}
      </div>
    );
  }
  const { package: pkg, payload } = viewQ.data;

  return (
    <div className="space-y-4">
      {mode === "org" && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
          <strong>Auditor preview.</strong> This is exactly what a granted auditor sees on login.
          Folders and files below sync live to their view.
        </div>
      )}

      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{pkg.state_agency}</div>
            <h2 className="font-display text-xl font-bold text-[#0f1b3d]">
              {pkg.title ?? `${pkg.state_agency} audit`}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {pkg.date_range_start} → {pkg.date_range_end}
              </span>
              <span>Provider: {pkg.organization_name}</span>
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium uppercase text-emerald-700">
                {pkg.status}
              </span>
            </div>
          </div>
        </div>
        {payload.is_seed && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <div>
              <strong>Synthetic seed data.</strong> Real client and staff records will render
              here once HIVE's compliant host and BAA are in effect. The layout is representative.
            </div>
          </div>
        )}
      </header>

      {/* NECTAR + subject records */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0f1b3d]">
          <Sparkles className="h-4 w-4 text-[#d97a1c]" /> NECTAR summary
        </div>
        <p className="text-sm text-slate-700">{payload.nectar_summary.overall}</p>
        {payload.nectar_summary.flags.length > 0 && (
          <ul className="mt-3 space-y-1">
            {payload.nectar_summary.flags.map((f, i) => (
              <li key={i} className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3 w-3" />
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        {payload.subjects.map((s) => (
          <SubjectCard key={s.subject_id} subject={s} nectarNote={payload.nectar_summary.per_subject[s.subject_id]} />
        ))}
      </div>

      {/* Folders + files area */}
      <PackageFilesSection packageId={packageId} mode={mode} />
    </div>
  );
}

function SubjectCard({ subject, nectarNote }: { subject: AuditPackageSubjectSummary; nectarNote?: string }) {
  const Icon = subject.subject_type === "staff" ? User : Contact2;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{subject.subject_type}</div>
          <div className="font-semibold text-[#0f1b3d]">{subject.subject_label}</div>
        </div>
      </header>

      {nectarNote && (
        <div className="mb-3 rounded-md border border-[#fed7aa]/50 bg-[#fff7ed] p-2 text-xs text-[#9a3412]">
          <Sparkles className="mr-1 inline h-3 w-3" /> {nectarNote}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <RecordBlock title="Timesheets" empty={subject.timesheets.length === 0}>
          <ul className="space-y-1 text-xs">
            {subject.timesheets.map((t, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                <span className="tabular-nums text-muted-foreground">{t.date}</span>
                <span>{t.service_code}</span>
                <span className="tabular-nums">{t.hours}h / {t.units}u</span>
                {t.evv_verified && <span className="text-emerald-600">EVV ✓</span>}
              </li>
            ))}
          </ul>
        </RecordBlock>

        <RecordBlock title="PCSP goals" empty={subject.pcsp_goals.length === 0}>
          <ul className="space-y-2 text-xs">
            {subject.pcsp_goals.map((g, i) => (
              <li key={i}>
                <div className="font-medium">{g.goal}</div>
                <div className="text-muted-foreground">{g.progress_pct}% · last note {g.last_note_date}</div>
                <div className="italic text-slate-600">&ldquo;{g.last_note}&rdquo;</div>
              </li>
            ))}
          </ul>
        </RecordBlock>

        <RecordBlock title="PBA ledger" empty={subject.pba_ledger.length === 0}>
          <ul className="space-y-1 text-xs">
            {subject.pba_ledger.map((l, i) => (
              <li key={i} className="flex justify-between border-b border-slate-100 pb-1 last:border-0">
                <span className="text-muted-foreground">{l.date}</span>
                <span>{l.memo}</span>
                <span className={`tabular-nums ${l.kind === "deposit" ? "text-emerald-700" : "text-red-700"}`}>
                  {l.kind === "deposit" ? "+" : "−"}${(l.amount_cents / 100).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </RecordBlock>

        <RecordBlock title="Billing support documents">
          <ul className="space-y-1 text-xs">
            {subject.billing_support_docs.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3 text-slate-400" /> {d.title}
                </span>
                <span className="text-muted-foreground tabular-nums">{d.date}</span>
                <span className={d.status === "on_file" ? "text-emerald-700" : "text-amber-700"}>
                  {d.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </RecordBlock>
      </div>
    </section>
  );
}

function RecordBlock({ title, empty, children }: { title: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {empty ? <div className="text-xs italic text-slate-400">None recorded.</div> : children}
    </div>
  );
}

// ============================================================
// Folders + files
// ============================================================

function PackageFilesSection({ packageId, mode }: { packageId: string; mode: "org" | "auditor" }) {
  const qc = useQueryClient();
  const foldersFn = useServerFn(listPackageFolders);
  const filesFn = useServerFn(listPackageFiles);
  const createFolderFn = useServerFn(createPackageFolder);
  const deleteFolderFn = useServerFn(deletePackageFolder);
  const uploadFn = useServerFn(createPackageFileUpload);
  const downloadFn = useServerFn(getPackageFileDownloadUrl);
  const deleteFileFn = useServerFn(deletePackageFile);

  const foldersQ = useQuery({
    queryKey: ["audit-package-folders", packageId],
    queryFn: () => foldersFn({ data: { auditPackageId: packageId } }),
  });
  const filesQ = useQuery({
    queryKey: ["audit-package-files", packageId],
    queryFn: () => filesFn({ data: { auditPackageId: packageId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["audit-package-folders", packageId] });
    qc.invalidateQueries({ queryKey: ["audit-package-files", packageId] });
  };

  const createFolderMut = useMutation({
    mutationFn: (name: string) => createFolderFn({ data: { auditPackageId: packageId, name } }),
    onSuccess: () => { toast.success("Folder created"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const deleteFolderMut = useMutation({
    mutationFn: (folderId: string) => deleteFolderFn({ data: { folderId } }),
    onSuccess: () => { toast.success("Folder deleted"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const deleteFileMut = useMutation({
    mutationFn: (fileId: string) => deleteFileFn({ data: { fileId } }),
    onSuccess: () => { toast.success("File deleted"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [uploading, setUploading] = useState(false);

  const folders = foldersQ.data ?? [];
  const files = filesQ.data ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string | null, AuditPackageFileRow[]>();
    map.set(null, []);
    for (const f of folders) map.set(f.id, []);
    for (const file of files) {
      const key = file.folder_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(file);
    }
    return map;
  }, [folders, files]);

  const canEdit = mode === "org";

  async function handleUpload(fileList: FileList | null, folderId: string | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const signed = await uploadFn({
          data: {
            auditPackageId: packageId,
            folderId,
            fileName: file.name,
            contentType: file.type || undefined,
            sizeBytes: file.size,
          },
        });
        const { error } = await supabase.storage
          .from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, file, {
            contentType: file.type || undefined,
          });
        if (error) throw error;
      }
      toast.success("Uploaded");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(fileId: string) {
    try {
      const r = await downloadFn({ data: { fileId } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[#0f1b3d]">Provider-uploaded files</div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="New folder name"
              className="min-h-[36px] rounded-md border border-slate-300 px-2 text-xs"
            />
            <button
              onClick={() => { if (newFolder.trim()) { createFolderMut.mutate(newFolder.trim()); setNewFolder(""); } }}
              disabled={createFolderMut.isPending}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-[#0f1b3d] px-3 text-xs font-semibold text-white hover:bg-[#1a2a5a] disabled:opacity-50"
            >
              <FolderPlus className="h-3 w-3" /> New folder
            </button>
          </div>
        )}
      </div>

      {mode === "org" && (
        <div className="mb-3 rounded border border-dashed border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          {/* PHI SEAM — repoint bucket 'audit-files' to compliant-host bucket before live client files */}
          <strong>Seed / sample files only</strong> — the storage bucket flips to the compliant host before real client documents.
        </div>
      )}

      <FolderBlock
        label="Package root"
        folderId={null}
        files={grouped.get(null) ?? []}
        active={activeFolderId === null}
        onActivate={() => setActiveFolderId(null)}
        canEdit={canEdit}
        onUpload={(fl) => handleUpload(fl, null)}
        onDownload={handleDownload}
        onDeleteFile={(id) => deleteFileMut.mutate(id)}
        uploading={uploading}
      />

      {folders.length === 0 ? (
        canEdit && <div className="mt-2 text-xs italic text-muted-foreground">No folders yet — create one above.</div>
      ) : (
        folders.map((f) => (
          <FolderBlock
            key={f.id}
            label={f.name}
            folderId={f.id}
            files={grouped.get(f.id) ?? []}
            active={activeFolderId === f.id}
            onActivate={() => setActiveFolderId(f.id)}
            canEdit={canEdit}
            onUpload={(fl) => handleUpload(fl, f.id)}
            onDownload={handleDownload}
            onDeleteFile={(id) => deleteFileMut.mutate(id)}
            onDeleteFolder={() => deleteFolderMut.mutate(f.id)}
            uploading={uploading}
          />
        ))
      )}
    </section>
  );
}

function FolderBlock({
  label, folderId, files, active, onActivate, canEdit,
  onUpload, onDownload, onDeleteFile, onDeleteFolder, uploading,
}: {
  label: string;
  folderId: string | null;
  files: AuditPackageFileRow[];
  active: boolean;
  onActivate: () => void;
  canEdit: boolean;
  onUpload: (files: FileList | null) => void;
  onDownload: (id: string) => void;
  onDeleteFile: (id: string) => void;
  onDeleteFolder?: () => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={canEdit ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={canEdit ? () => setDragOver(false) : undefined}
      onDrop={canEdit ? (e) => {
        e.preventDefault();
        setDragOver(false);
        onUpload(e.dataTransfer.files);
      } : undefined}
      onClick={onActivate}
      className={`mt-2 rounded-lg border p-3 transition-colors ${
        dragOver ? "border-emerald-400 bg-emerald-50" :
        active ? "border-[#0f1b3d]/40 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[#0f1b3d]">
          <Folder className="h-4 w-4 text-amber-500" /> {label}
          <span className="text-xs text-muted-foreground">({files.length})</span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { onUpload(e.target.files); if (inputRef.current) inputRef.current.value = ""; }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              disabled={uploading}
              className="inline-flex min-h-[32px] items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Upload
            </button>
            {onDeleteFolder && (
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete folder "${label}"? Files inside will move to Package root.`)) onDeleteFolder(); }}
                className="text-red-600 hover:text-red-800"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {files.length === 0 ? (
        <div className="mt-2 text-xs italic text-muted-foreground">
          {canEdit ? "Drop files here or click Upload." : "No files."}
        </div>
      ) : (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/60 px-2 py-1 text-xs">
              <span className="flex items-center gap-2 truncate">
                <FileText className="h-3 w-3 text-slate-400" />
                <span className="truncate">{f.file_name}</span>
                {f.size_bytes != null && (
                  <span className="text-muted-foreground">({formatBytes(f.size_bytes)})</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onDownload(f.id); }}
                  className="inline-flex items-center gap-1 text-[#0f1b3d] hover:underline"
                >
                  <Download className="h-3 w-3" /> Download
                </button>
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${f.file_name}"?`)) onDeleteFile(f.id); }}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
