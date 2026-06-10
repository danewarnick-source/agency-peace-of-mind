import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { createSwapRequest } from "@/lib/schedule-requests";

export function RequestSwapDialog({
  shiftId,
  shiftLabel,
  trigger,
}: {
  shiftId: string;
  shiftLabel: string;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const [open, setOpen] = useState(false);
  const [toStaff, setToStaff] = useState<string>("__open__");
  const [note, setNote] = useState("");

  // Org coworker picker — open swap is also allowed.
  const { data: staff } = useQuery({
    enabled: open && !!orgId,
    queryKey: ["org-staff-picker", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name")
        .eq("tenant_id", orgId!);
      if (error) throw error;
      return (data ?? [])
        .map((p) => ({
          id: p.id as string,
          name:
            (p.full_name?.trim() as string) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
            "Staff",
        }))
        .filter((p) => p.id !== user?.id);
    },
  });

  useEffect(() => { if (!open) { setToStaff("__open__"); setNote(""); } }, [open]);

  const m = useMutation({
    mutationFn: async () => {
      if (!orgId || !user?.id) throw new Error("Sign in required.");
      await createSwapRequest({
        organization_id: orgId,
        shift_id: shiftId,
        from_staff_id: user.id,
        to_staff_id: toStaff === "__open__" ? null : toStaff,
        note,
      });
    },
    onSuccess: () => {
      toast.success("Swap request sent.");
      qc.invalidateQueries({ queryKey: ["my-schedule-requests"] });
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request swap</DialogTitle>
          <DialogDescription className="truncate">{shiftLabel}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label>Hand off to</Label>
            <Select value={toStaff} onValueChange={setToStaff}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__open__">Anyone (open swap)</SelectItem>
                {(staff ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Note (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
