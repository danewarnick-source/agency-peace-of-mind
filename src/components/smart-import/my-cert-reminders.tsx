import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, BellRing, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listSmartImportReminders,
  employeeUploadImportCert,
  resolveSmartImportReminder,
} from "@/lib/smart-import-reminders.functions";
import { toast } from "sonner";

type Reminder = {
  id: string;
  type: string;
  urgency: "normal" | "urgent" | "critical";
  title: string;
  body: string;
  related_id: string | null;
  related_type: string | null;
};

/**
 * Mobile-friendly self-upload surface for staff. Shows "my" Smart Import
 * cert reminders (provisional / unverified / expiring) and lets the user
 * snap a photo / upload from phone. Upload → admin verifies → Verified.
 */
export function MySmartImportCertReminders() {
  const list = useServerFn(listSmartImportReminders);
  const upload = useServerFn(employeeUploadImportCert);
  const resolve = useServerFn(resolveSmartImportReminder);
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expiryById, setExpiryById] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["my-smart-import-reminders-page"],
    queryFn: () => list({ data: { scope: "mine" } }),
    staleTime: 30_000,
  });

  const uploadM = useMutation({
    mutationFn: async (args: { reminderId: string; certDocId: string; file: File; expiry: string | null }) => {
      const fileBase64 = await fileToBase64(args.file);
      await upload({
        data: {
          importCertDocumentId: args.certDocId,
          fileName: args.file.name,
          fileBase64,
          expiryDate: args.expiry,
        },
      });
      await resolve({ data: { id: args.reminderId } });
    },
    onSuccess: () => {
      toast.success("Uploaded. Your admin will verify it shortly.");
      qc.invalidateQueries({ queryKey: ["my-smart-import-reminders-page"] });
      qc.invalidateQueries({ queryKey: ["my-smart-import-reminders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
    onSettled: () => setBusyId(null),
  });

  const reminders = (data?.reminders ?? []) as Reminder[];
  const certReminders = reminders.filter((r) => r.related_type === "import_cert_document" && r.related_id);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading your reminders…
      </div>
    );
  }
  if (certReminders.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300/50 bg-amber-50/40 p-4 dark:bg-amber-950/15">
      <div className="mb-3 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold">From your Smart Import setup</h3>
        <Badge variant="outline" className="ml-1 text-[10px]">{certReminders.length}</Badge>
      </div>
      <ul className="space-y-3">
        {certReminders.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {r.urgency === "critical" && <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
                  {r.title}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.body}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-[11px]">Expiry (optional)</Label>
                <Input
                  type="date"
                  value={expiryById[r.id] ?? ""}
                  onChange={(e) => setExpiryById((m) => ({ ...m, [r.id]: e.target.value }))}
                  className="h-9 text-xs"
                />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <label className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {busyId === r.id ? "Uploading…" : "Snap or upload cert"}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf"
                    capture="environment"
                    disabled={busyId === r.id}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f || !r.related_id) return;
                      setBusyId(r.id);
                      uploadM.mutate({
                        reminderId: r.id,
                        certDocId: r.related_id,
                        file: f,
                        expiry: expiryById[r.id] || null,
                      });
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}
