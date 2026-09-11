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
import {
  initialRemediationPlanStatus,
  planOwnerLabel,
} from "@/lib/obligations/remediation";
import { proposeRemediationPlan } from "@/lib/obligations/remediation.functions";
import type { Decision } from "@/lib/obligations/this-week.functions";

type Props = {
  open: boolean;
  organizationId: string | null;
  item: Decision;
  onOpenChange: (open: boolean) => void;
};

function dateValue(iso: string | null | undefined): string {
  if (iso) return iso.slice(0, 10);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

export function OverdueObligationPlanDialog({
  open,
  organizationId,
  item,
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const [planText, setPlanText] = useState("");
  const [dueAt, setDueAt] = useState(() => dateValue(item.dueAt));
  const planFn = useServerFn(proposeRemediationPlan);
  const owner = planOwnerLabel("overdue");
  const createsApproved = initialRemediationPlanStatus("overdue") === "approved";

  const planMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("No active organization");
      const trimmed = planText.trim();
      if (trimmed.length < 8) throw new Error("Plan text must be at least 8 characters.");
      if (!dueAt) throw new Error("Due date is required.");
      await planFn({
        data: {
          organizationId,
          kind: "overdue",
          title: item.title,
          planText: trimmed,
          obligationKey: item.obligationKey ?? null,
          obligationId: item.obligationId ?? null,
          instanceId: item.instanceId ?? null,
          dueAt,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        createsApproved && owner === "manager"
          ? "Plan recorded."
          : "Sent for admin approval",
      );
      setPlanText("");
      setDueAt(dateValue(item.dueAt));
      void qc.invalidateQueries({ queryKey: ["this-week-plans", organizationId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Overdue obligation plan</DialogTitle>
          <DialogDescription>
            Log a plan for {item.title}.
            {createsApproved
              ? " This records as approved for the owning manager."
              : " Admin-level approval is required."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="overdue-obligation-plan">Plan</Label>
            <Textarea
              id="overdue-obligation-plan"
              value={planText}
              onChange={(e) => setPlanText(e.target.value)}
              rows={4}
              placeholder="How this clock will be closed, and by when."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="overdue-obligation-due">Due date</Label>
            <Input
              id="overdue-obligation-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={planMut.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={planMut.isPending} onClick={() => planMut.mutate()}>
            {createsApproved ? "Record plan" : "Submit plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
