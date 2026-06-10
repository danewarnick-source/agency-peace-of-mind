import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { createTimeOffRequest, type TimeOffRequest } from "@/lib/schedule-requests";

const TYPES: TimeOffRequest["type"][] = ["pto", "sick", "personal", "unpaid", "other"];

export function RequestTimeOffDialog({ trigger }: { trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState<TimeOffRequest["type"]>("pto");
  const [note, setNote] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (!org?.organization_id || !user?.id) throw new Error("Sign in required.");
      await createTimeOffRequest({
        organization_id: org.organization_id,
        staff_id: user.id,
        start_date: start,
        end_date: end || start,
        type,
        note,
      });
    },
    onSuccess: () => {
      toast.success("Time-off request sent.");
      qc.invalidateQueries({ queryKey: ["my-schedule-requests"] });
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      setOpen(false);
      setStart(""); setEnd(""); setNote(""); setType("pto");
    },
    onError: (e: Error) => toast.error(e.message || "Could not submit."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request time off</DialogTitle>
          <DialogDescription>Your manager will see this in the schedule.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>End date</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as TimeOffRequest["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
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
          <Button onClick={() => m.mutate()} disabled={m.isPending || !start}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
