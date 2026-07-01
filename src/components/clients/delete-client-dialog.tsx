import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteClientPermanently, getClientDeletionImpact } from "@/lib/client-lifecycle.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string | null;
  clientName: string;
  onDeleted?: () => void;
};

const IMPACT_ROWS: Array<{ key: keyof import("@/lib/client-lifecycle.functions").ClientDeletionImpact; label: string }> = [
  { key: "documents", label: "Uploaded documents (incl. PCSP)" },
  { key: "billing_codes", label: "Billing authorizations (1056)" },
  { key: "emergency_contacts", label: "Emergency contacts" },
  { key: "medications", label: "Medications" },
  { key: "mar_entries", label: "MAR entries" },
  { key: "daily_logs", label: "Daily logs" },
  { key: "incidents", label: "Incident reports" },
  { key: "shifts", label: "Scheduled shifts" },
  { key: "timesheets", label: "EVV timesheets" },
  { key: "progress_summaries", label: "Progress summaries" },
  { key: "client_trainings", label: "Client-specific trainings" },
  { key: "staff_assignments", label: "Staff assignments" },
  { key: "loans", label: "Client loans" },
];

export function DeleteClientDialog({ open, onOpenChange, clientId, clientName, onDeleted }: Props) {
  const impactFn = useServerFn(getClientDeletionImpact);
  const deleteFn = useServerFn(deleteClientPermanently);
  const [typed, setTyped] = useState("");

  const impactQ = useQuery({
    enabled: open && !!clientId,
    queryKey: ["client-delete-impact", clientId],
    queryFn: () => impactFn({ data: { clientId: clientId! } }),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { clientId: clientId! } }),
    onSuccess: (res) => {
      toast.success(`${res.client_name || "Client"} permanently deleted.`);
      setTyped("");
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameMatches = typed.trim().toLowerCase() === clientName.trim().toLowerCase() && clientName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setTyped(""); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Permanently delete client?
          </DialogTitle>
          <DialogDescription>
            Deleting <strong>{clientName}</strong> permanently erases every record tied to this
            person&apos;s supports across your organization. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <div className="mb-2 font-semibold">What gets erased</div>
            {impactQ.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Counting records…
              </div>
            ) : impactQ.data ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {IMPACT_ROWS.map((r) => (
                  <li key={r.key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-mono">{(impactQ.data[r.key] as number) ?? 0}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-muted-foreground">Unable to load record counts.</div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Retained for compliance:</strong> training certificates
            already earned by staff (they carry a frozen snapshot of the client&apos;s name),
            billing submission history, and import audit trail.
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirm-name" className="text-xs">
              Type <span className="font-mono font-semibold">{clientName}</span> to confirm
            </Label>
            <Input
              id="confirm-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={clientName}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!nameMatches || del.isPending}
            onClick={() => del.mutate()}
          >
            {del.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Trash2 className="mr-2 h-4 w-4" />}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
