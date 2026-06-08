/**
 * Requirement Tracking Editor — small dialog for provider-set cadence,
 * "Tell NECTAR" note, and last-verified date.
 *
 * Provider declares; NECTAR organizes. Used both at confirm-time (inline)
 * and for already-confirmed requirements (via this dialog).
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { updateRequirementTracking } from "@/lib/requirement-tracking.functions";
import {
  FREQUENCY_OPTIONS,
  type RequirementFrequency,
  type RequirementTracking,
} from "@/lib/requirement-tracking";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requirementId: string;
  requirementTitle: string;
  orgId: string;
  current: Partial<RequirementTracking> | null | undefined;
}

export function RequirementTrackingEditor({
  open,
  onOpenChange,
  requirementId,
  requirementTitle,
  orgId,
  current,
}: Props) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateRequirementTracking);

  const [frequency, setFrequency] = useState<string>("");
  const [tellNectarNote, setTellNectarNote] = useState<string>("");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [lastCheckedAt, setLastCheckedAt] = useState<string>(todayIso);

  useEffect(() => {
    if (open) {
      setFrequency(current?.frequency ?? "");
      setTellNectarNote(current?.tell_nectar_note ?? "");
      setLastCheckedAt(current?.last_checked_at ?? todayIso);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requirementId]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          requirementId,
          frequency: (frequency || null) as RequirementFrequency | null,
          tellNectarNote: tellNectarNote.trim() || null,
          lastCheckedAt: lastCheckedAt || null,
        },
      }),
    onSuccess: () => {
      toast.success("Tracking updated.");
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
      qc.invalidateQueries({ queryKey: ["internal-audit", orgId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Tracking — {requirementTitle}</DialogTitle>
          <DialogDescription className="text-xs">
            You set the cadence and describe how you track it. NECTAR stores and reminds — it
            doesn't invent a rule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">How often does this recur?</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Choose a cadence" />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tell NECTAR — how do <em>you</em> track this?</Label>
            <Textarea
              value={tellNectarNote}
              onChange={(e) => setTellNectarNote(e.target.value)}
              placeholder='e.g. "1056s live on the Provider UPI/USTEPS — updated ongoing."'
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">
              Your words. NECTAR surfaces this as a reminder.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Last verified</Label>
            <Input
              type="date"
              value={lastCheckedAt}
              onChange={(e) => setLastCheckedAt(e.target.value)}
              max={todayIso}
              className="h-8"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
