import { useEffect, useRef, useState } from "react";
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

/**
 * Native type="date" on Android/iOS opens the system calendar as soon as
 * the field is focused (or sometimes as soon as it mounts in a dialog).
 * Stay on type="text" until this field is tapped, then arm the picker.
 */
function TimeOffDateField({
  id,
  label,
  value,
  onChange,
  dialogOpen,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  dialogOpen: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!dialogOpen) setArmed(false);
  }, [dialogOpen]);

  useEffect(() => {
    if (!armed) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      /* showPicker is user-gesture gated on some browsers; tap still focuses */
    }
  }, [armed]);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={ref}
        id={id}
        type={armed ? "date" : "text"}
        inputMode="none"
        autoComplete="off"
        autoFocus={false}
        readOnly={!armed}
        placeholder="Tap to choose"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={() => {
          if (!armed) setArmed(true);
        }}
      />
    </div>
  );
}

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
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Request time off</DialogTitle>
          <DialogDescription>Your manager will see this in the schedule.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TimeOffDateField
              id="time-off-start"
              label="Start date"
              value={start}
              onChange={setStart}
              dialogOpen={open}
            />
            <TimeOffDateField
              id="time-off-end"
              label="End date"
              value={end}
              onChange={setEnd}
              dialogOpen={open}
            />
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
