// Import schedule dialog — uploads a file (PDF/image/CSV/text) to Nectar,
// then hands the returned drafts back to the parent to render in the standard
// review table.
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Upload, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { nectarImportSchedule } from "@/lib/scheduler/import.functions";

type Draft = {
  staff_id: string | null;
  staff_label: string | null;
  client_id: string | null;
  client_label: string | null;
  service_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  flags: string[];
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });
}

export function ImportScheduleDialog({
  open, onClose, organizationId, weekStartIso, onDrafts,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  weekStartIso: string;
  onDrafts: (drafts: Draft[]) => void;
}) {
  const importFn = useServerFn(nectarImportSchedule);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick a file first.");
      const b64 = await fileToBase64(file);
      return importFn({
        data: {
          organization_id: organizationId,
          file_name: file.name,
          file_mime: file.type || "application/octet-stream",
          file_b64: b64,
          week_start_iso: weekStartIso,
        },
      });
    },
    onSuccess: (r) => {
      if (!r.drafts || r.drafts.length === 0) {
        toast.info("Nectar didn't find any shifts in that file.");
        return;
      }
      onDrafts(r.drafts);
      setFile(null);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import schedule
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a schedule (PDF, photo, screenshot, CSV, or text). Nectar drafts
            shifts and matches names to your real staff and clients. Anything it can't
            match is flagged for you to fix before publishing.
          </p>

          <div className="border-2 border-dashed rounded-md p-6 text-center">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                  <X className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1.5" /> Choose file
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Nothing is published — all extracted shifts land as drafts you review and edit first.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!file || mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Import with Nectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
