import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { discardImportJobHard } from "@/lib/client-lifecycle.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobId: string | null;
  onDiscarded?: () => void;
};

export function DiscardImportDialog({ open, onOpenChange, jobId, onDiscarded }: Props) {
  const discardFn = useServerFn(discardImportJobHard);
  const m = useMutation({
    mutationFn: () => discardFn({ data: { jobId: jobId! } }),
    onSuccess: () => {
      toast.success("Smart import discarded.");
      onOpenChange(false);
      onDiscarded?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Discard this smart import?
          </DialogTitle>
          <DialogDescription>
            This permanently removes the uploaded PCSP, all extracted fields, the draft
            profile, and any staff-assignment mapping for this import. It does <strong>not</strong>{" "}
            affect clients you&apos;ve already finalized. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={m.isPending || !jobId} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Discard import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
