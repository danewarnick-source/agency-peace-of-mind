import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordObligationOverride } from "@/lib/obligations/remediation.functions";
import { OVERRIDE_STILL_REQUIRED, type OverrideScope } from "@/lib/obligations/overrides";

function defaultExpiresAt(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  organizationId: string | null;
  staffId: string;
  title: string;
  obligationKey: string;
  obligationId?: string | null;
  instanceId?: string | null;
  scope?: OverrideScope;
  onOpenChange: (open: boolean) => void;
};

export function RecordOverrideDialog({
  open,
  organizationId,
  staffId,
  title,
  obligationKey,
  obligationId,
  instanceId,
  scope = "instance",
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const recordFn = useServerFn(recordObligationOverride);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);

  const mut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No active organization");
      const trimmed = reason.trim();
      if (trimmed.length < 8) throw new Error("Override reason must be at least 8 characters.");
      if (!expiresAt) throw new Error("Override expiration is required.");
      await recordFn({
        data: {
          organizationId,
          staffId,
          obligationKey,
          obligationId: obligationId ?? null,
          instanceId: instanceId ?? null,
          reason: trimmed,
          scope,
          expiresAt: new Date(`${expiresAt}T23:59:59.000Z`).toISOString(),
        },
      });
    },
    onSuccess: () => {
      toast.success("Override recorded. The requirement is still not complete.");
      setReason("");
      setExpiresAt(defaultExpiresAt());
      void qc.invalidateQueries({ queryKey: ["obligation-overrides"] });
      void qc.invalidateQueries({ queryKey: ["obligation-overrides-org"] });
      void qc.invalidateQueries({ queryKey: ["staff-obligation-files"] });
      void qc.invalidateQueries({ queryKey: ["this-week-plans"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record override</DialogTitle>
          <DialogDescription>
            {title}. You are the authorizing manager. {OVERRIDE_STILL_REQUIRED}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="override-reason">Reason</Label>
            <Textarea
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Why this override is authorized, and what remains outstanding."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-expires">Expires</Label>
            <Input
              id="override-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Scope:{" "}
            {scope === "staff_clock"
              ? "this staff clock"
              : scope === "shift"
                ? "one shift"
                : "this instance"}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={mut.isPending} onClick={() => mut.mutate()}>
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
