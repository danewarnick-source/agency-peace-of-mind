import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, Printer, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  listStaffObligationInstances,
  recordCompletion,
  type StaffObligationFileRow,
} from "@/lib/company-obligations.functions";
import {
  hasValidObligationEvidence,
  liveObligationTitle,
  obligationFileStatus,
  obligationFileStatusLabel,
  personnelPackHtml,
  type ObligationFileStatus,
} from "@/lib/staff-obligation-files";

type FileRow = {
  instance: StaffObligationFileRow;
  title: string;
  status: ObligationFileStatus;
  evidencePath: string | null;
  evidenceFilename: string | null;
};

function buildRows(raw: StaffObligationFileRow[]): FileRow[] {
  return raw.map((instance) => {
    const completion = instance.completion;
    const hasCompletion = !!(
      completion ||
      instance.upload_path ||
      instance.status === "completed" ||
      instance.status === "waived"
    );
    const hasValidEvidence = hasValidObligationEvidence({
      instanceStatus: instance.status,
      hasCompletion,
      nectarValidationStatus: completion?.nectar_validation_status ?? null,
    });
    return {
      instance,
      title: liveObligationTitle(
        instance.obligation.title,
        instance.obligation.scope,
        instance.client_name,
      ),
      status: obligationFileStatus({
        instanceStatus: instance.status,
        dueAt: instance.due_at,
        hasValidEvidence,
      }),
      evidencePath: completion?.upload_path ?? instance.upload_path,
      evidenceFilename: completion?.upload_filename ?? instance.upload_filename,
    };
  });
}

function statusBadgeClass(status: ObligationFileStatus): string {
  if (status === "on_file") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "due_soon") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function guessIsImage(filename: string | null): boolean {
  return !!filename && /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename);
}

async function signedEvidenceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("obligation-evidence").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not open file");
  return data.signedUrl;
}

export function StaffObligationsFilesTab({
  organizationId,
  staffId,
  staffName,
}: {
  organizationId: string;
  staffId: string;
  staffName: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStaffObligationInstances);
  const recordFn = useServerFn(recordCompletion);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadInstanceId, setUploadInstanceId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [viewIds, setViewIds] = useState<string[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["staff-obligation-files", organizationId, staffId],
    enabled: !!organizationId && !!staffId,
    queryFn: () => listFn({ data: { organizationId, staffId } }),
  });

  const rows = useMemo(() => buildRows(listQ.data ?? []), [listQ.data]);
  const selectedRows = rows.filter((r) => selected.has(r.instance.id));
  const viewQueue = useMemo(
    () => viewIds.map((id) => rows.find((r) => r.instance.id === id)).filter((r): r is FileRow => !!r),
    [viewIds, rows],
  );
  const viewing = viewQueue[viewIndex] ?? null;
  const viewerOpen = viewIds.length > 0;

  useEffect(() => {
    if (!viewing?.evidencePath) {
      setViewUrl(null);
      return;
    }
    let cancelled = false;
    signedEvidenceUrl(viewing.evidencePath)
      .then((url) => {
        if (!cancelled) setViewUrl(url);
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Could not open file");
      });
    return () => {
      cancelled = true;
    };
  }, [viewing?.evidencePath]);

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    setSelected(on ? new Set(rows.map((r) => r.instance.id)) : new Set());
  };

  const openUpload = () => {
    const only = selectedRows.length === 1 ? selectedRows[0]!.instance.id : null;
    setUploadInstanceId(only);
    setUploadFile(null);
    setUploadOpen(true);
  };

  const openView = (row: FileRow) => {
    if (!row.evidencePath) {
      toast.error("No file on this item yet.");
      return;
    }
    setViewIds([row.instance.id]);
    setViewIndex(0);
  };

  const viewSelected = () => {
    const withFiles = selectedRows.filter((r) => r.evidencePath);
    if (!withFiles.length) {
      toast.error("Select items that have a file on record.");
      return;
    }
    setViewIds(withFiles.map((r) => r.instance.id));
    setViewIndex(0);
  };

  const printPack = async () => {
    const pack = (selectedRows.length ? selectedRows : rows).filter((r) => r.evidencePath);
    if (!pack.length) {
      toast.error("Select items that have a file on record.");
      return;
    }
    try {
      const files = await Promise.all(
        pack.map(async (r) => ({
          staffName: staffName,
          title: r.title,
          filename: r.evidenceFilename ?? "evidence",
          url: await signedEvidenceUrl(r.evidencePath!),
        })),
      );
      const win = window.open("", "_blank");
      if (!win) throw new Error("Pop-up blocked — allow pop-ups to print the pack.");
      win.document.write(personnelPackHtml(files));
      win.document.close();
      win.focus();
      win.print();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the print pack");
    }
  };

  const targetInstance = rows.find((r) => r.instance.id === uploadInstanceId) ?? null;
  const attestationBlocked = targetInstance?.instance.obligation.evidence_type === "attestation";

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!targetInstance) throw new Error("Choose a personnel file item.");
      if (attestationBlocked) {
        throw new Error("This item requires the staff member to attest themselves.");
      }
      if (!uploadFile) throw new Error("Choose a file to upload.");
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${organizationId}/manual/${targetInstance.instance.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("obligation-evidence").upload(path, uploadFile);
      if (upErr) throw new Error(upErr.message);
      await recordFn({
        data: {
          organizationId,
          instanceId: targetInstance.instance.id,
          evidenceTypeUsed: "upload",
          uploadPath: path,
          uploadFilename: uploadFile.name,
          isManualEntry: true,
          staffId,
          staffName,
          completedAt: new Date().toISOString(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Evidence saved to this personnel file item.");
      setUploadOpen(false);
      setUploadFile(null);
      qc.invalidateQueries({ queryKey: ["staff-obligation-files", organizationId, staffId] });
      qc.invalidateQueries({ queryKey: ["company-obligations", organizationId] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  if (listQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading personnel file…</p>;
  }
  if (listQ.error) {
    return (
      <p className="text-sm text-rose-700">
        {listQ.error instanceof Error ? listQ.error.message : "Could not load this personnel file."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={viewSelected} disabled={!selectedRows.some((r) => r.evidencePath)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          View selected
        </Button>
        <Button size="sm" variant="outline" onClick={() => void printPack()} disabled={!rows.some((r) => r.evidencePath)}>
          <Printer className="mr-1.5 h-3.5 w-3.5" />
          Print / PDF pack
        </Button>
        <Button size="sm" onClick={openUpload}>
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Upload evidence…
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing on this personnel file yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <Checkbox
                    checked={rows.length > 0 && selected.size === rows.length}
                    onCheckedChange={(v) => toggleAll(!!v)}
                    aria-label="Select all personnel file items"
                  />
                </th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.instance.id} className="border-t">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.has(row.instance.id)}
                      onCheckedChange={(v) => toggle(row.instance.id, !!v)}
                      aria-label={`Select ${row.title}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.title}</p>
                    {row.evidenceFilename && (
                      <p className="text-xs text-muted-foreground">{row.evidenceFilename}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={statusBadgeClass(row.status)}>
                      {obligationFileStatusLabel(row.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDue(row.instance.due_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!row.evidencePath}
                      onClick={() => openView(row)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{targetInstance?.status === "on_file" ? "Replace evidence" : "Upload evidence"}</DialogTitle>
            <DialogDescription>
              File attaches to this staff member’s existing personnel file item — the same record as the org-wide Personnel file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Personnel file item</Label>
              <Select value={uploadInstanceId ?? ""} onValueChange={(v) => setUploadInstanceId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an item…" />
                </SelectTrigger>
                <SelectContent>
                  {rows.map((r) => (
                    <SelectItem key={r.instance.id} value={r.instance.id}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {attestationBlocked ? (
              <p className="text-sm text-amber-900">
                This item requires the staff member to attest themselves. Evidence cannot be filed here.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="obligation-evidence-file">File</Label>
                <Input
                  id="obligation-evidence-file"
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={attestationBlocked || !uploadInstanceId || !uploadFile || uploadMut.isPending}
              onClick={() => uploadMut.mutate()}
            >
              {uploadMut.isPending ? "Saving…" : "Save evidence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewerOpen} onOpenChange={(open) => { if (!open) setViewIds([]); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.title ?? "Evidence"}</DialogTitle>
            <DialogDescription>
              {viewing?.evidenceFilename ?? "Print from this viewer."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-[50vh] rounded-md border border-border bg-muted/20">
            {!viewUrl ? (
              <p className="p-6 text-sm text-muted-foreground">Loading file…</p>
            ) : guessIsImage(viewing?.evidenceFilename ?? null) ? (
              <img src={viewUrl} alt="" className="max-h-[70vh] w-full object-contain" />
            ) : (
              <iframe title="Personnel file evidence" src={viewUrl} className="h-[70vh] w-full border-0" />
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={viewIndex <= 0}
                onClick={() => setViewIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={viewIndex >= viewQueue.length - 1}
                onClick={() => setViewIndex((i) => Math.min(viewQueue.length - 1, i + 1))}
              >
                Next
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!viewUrl}
              onClick={() => {
                if (!viewUrl) return;
                const w = window.open(viewUrl, "_blank");
                w?.focus();
                w?.print();
              }}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

