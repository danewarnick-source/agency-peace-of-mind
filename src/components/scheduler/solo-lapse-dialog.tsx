import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  proposeRemediationPlan,
  recordSoloOverride,
} from "@/lib/obligations/remediation.functions";
import type { SoloLapse } from "@/lib/obligations/solo-lapse";

type Props = {
  open: boolean;
  organizationId: string | null;
  staffId: string;
  staffName: string;
  lapses: SoloLapse[];
  onOpenChange: (open: boolean) => void;
  onAllowSchedule: () => void;
};

export function SoloLapseDialog({
  open,
  organizationId,
  staffId,
  staffName,
  lapses,
  onOpenChange,
  onAllowSchedule,
}: Props) {
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"choose" | "override" | "plan">("choose");
  const overrideFn = useServerFn(recordSoloOverride);
  const planFn = useServerFn(proposeRemediationPlan);

  const overrideMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No active organization");
      const trimmed = reason.trim();
      if (trimmed.length < 8) throw new Error("Override reason must be at least 8 characters.");
      for (const lapse of lapses) {
        await overrideFn({
          data: {
            organizationId,
            staffId,
            obligationKey: lapse.obligationKey,
            obligationId: lapse.obligationId,
            instanceId: lapse.instanceId,
            reason: trimmed,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Override recorded. Shift can be saved.");
      setReason("");
      setMode("choose");
      onAllowSchedule();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const planMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No active organization");
      const trimmed = reason.trim();
      if (trimmed.length < 8) throw new Error("Plan text must be at least 8 characters.");
      for (const lapse of lapses) {
        await planFn({
          data: {
            organizationId,
            kind: "solo_lapse",
            title: lapse.title,
            planText: trimmed,
            obligationKey: lapse.obligationKey,
            obligationId: lapse.obligationId,
            instanceId: lapse.instanceId,
            staffId,
            dueAt: lapse.dueAt,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Remediation plan submitted for approval. Staff stays blocked from solo work.");
      setReason("");
      setMode("choose");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = overrideMut.isPending || planMut.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setMode("choose");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cannot work alone</DialogTitle>
          <DialogDescription>
            {staffName} has a lapsed requirement that blocks working alone. Reassign the
            shift, record a manager override, or submit a remediation plan.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm">
          {lapses.map((lapse) => (
            <li key={`${lapse.obligationKey}:${lapse.instanceId ?? lapse.obligationId}`}>
              {lapse.label}
              {lapse.dueAt ? ` — due ${lapse.dueAt.slice(0, 10)}` : ""}
            </li>
          ))}
        </ul>
        {mode !== "choose" ? (
          <div className="space-y-2">
            <Label htmlFor="solo-lapse-reason">
              {mode === "override" ? "Override reason" : "Plan"}
            </Label>
            <Textarea
              id="solo-lapse-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder={
                mode === "override"
                  ? "Why this staff may work this shift while the clock is lapsed."
                  : "How this clock will be restored, and by when."
              }
            />
          </div>
        ) : null}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {mode === "choose" ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Reassign
              </Button>
              <Button type="button" variant="outline" onClick={() => setMode("plan")}>
                Propose plan
              </Button>
              <Button type="button" onClick={() => setMode("override")}>
                Record override
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setMode("choose")}>
                Back
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => (mode === "override" ? overrideMut.mutate() : planMut.mutate())}
              >
                {mode === "override" ? "Save override" : "Submit plan"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
