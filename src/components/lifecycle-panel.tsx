import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Archive, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { archiveEntity, deleteEntity } from "@/lib/lifecycle.functions";

type Props = {
  kind: "employee" | "client";
  id: string;
  fullName: string;
  organizationId?: string | null;
  onDone?: () => void;
  onDeleted?: () => void;
};

export function LifecyclePanel({ kind, id, fullName, organizationId, onDone, onDeleted }: Props) {
  const qc = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const archiveFn = useServerFn(archiveEntity);
  const deleteFn = useServerFn(deleteEntity);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
    qc.invalidateQueries({ queryKey: ["caseload-all-clients"] });
  };

  const archiveMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Missing organization");
      await archiveFn({ data: { kind, id, organizationId } });
    },
    onSuccess: () => {
      toast.success(`${fullName} archived. Access has been suspended.`);
      setArchiveOpen(false);
      invalidate();
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Missing organization");
      await deleteFn({ data: { kind, id, organizationId, confirmName } });
    },
    onSuccess: () => {
      toast.success(`${fullName} permanently deleted.`);
      setDeleteOpen(false);
      setConfirmName("");
      invalidate();
      if (onDeleted) onDeleted();
      else onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameMatches = confirmName.trim().toLowerCase() === fullName.trim().toLowerCase() && fullName.trim().length > 0;

  return (
    <div className="grid gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Danger zone</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
          <Archive className="mr-1.5 h-3.5 w-3.5" /> 📁 Archive Profile
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={() => { setConfirmName(""); setDeleteOpen(true); }}>
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> ⚠️ Permanently Delete Record
        </Button>
      </div>

      {/* Archive modal */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {fullName}?</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive {fullName}? This will immediately terminate their active platform access,
              disable all linked login tokens, remove them from all active house rosters, and freeze their ledger.
              All historical notes and clinical documentation will be safely preserved for state audit compliance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button onClick={() => archiveMut.mutate()} disabled={archiveMut.isPending}>
              {archiveMut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Archiving…</> : "Confirm archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete modal */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setConfirmName(""); }}>
        <DialogContent className="border-destructive/60">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> CRITICAL WARNING
            </DialogTitle>
            <DialogDescription className="text-foreground">
              You are about to permanently delete <strong>{fullName}</strong>'s complete profile registry entry.
              This action is absolute and cannot be undone. Wiping this account will permanently destroy all linked
              historical shift note telemetries, background check records, eMAR logs, and financial ledger data from
              our database servers, potentially violating state data retention guidelines.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-md bg-destructive/10 p-3">
            <Label htmlFor="confirm-name" className="text-sm">
              To confirm absolute deletion, please type the individual's full name below:
            </Label>
            <Input
              id="confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={fullName}
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              Must match exactly: <code className="rounded bg-background px-1">{fullName}</code>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!nameMatches || deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…</> : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
