import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listEligibleSwapPartners, requestSwap } from "@/lib/scheduling/swaps.functions";

export function SwapRequestDialog({
  open, onOpenChange, shiftId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  shiftId: string;
}) {
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState<string | "">("");
  const [note, setNote] = useState("");

  const listFn = useServerFn(listEligibleSwapPartners);
  const reqFn = useServerFn(requestSwap);

  const partners = useQuery({
    queryKey: ["swap-partners", shiftId],
    queryFn: () => listFn({ data: { shiftId } }),
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: () => reqFn({
      data: { shiftId, toStaffId: partnerId || undefined, note: note.trim() || undefined },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-swaps"] });
      toast.success("Swap request submitted");
      onOpenChange(false);
      setNote(""); setPartnerId("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to request swap"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request shift swap</DialogTitle>
          <DialogDescription>Pick an eligible coworker, or leave blank to make it open to anyone available.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Coworker (optional)</Label>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">— Anyone available —</option>
              {(partners.data ?? []).map((p) => (
                <option key={p.staffId} value={p.staffId}>{p.name}</option>
              ))}
            </select>
            {partners.isLoading && <p className="mt-1 text-xs text-muted-foreground">Loading…</p>}
          </div>

          <div>
            <Label>Reason (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you requesting a swap?" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
