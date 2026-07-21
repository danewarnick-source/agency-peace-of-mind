// Manual timesheet entry — for a missed clock-in/out or similar, either an
// admin logging one on behalf of a staff member (Documentation > Records) or
// a staff member logging one for themselves (My time corrections). The
// resulting evv_timesheets row is a real record but is stamped
// shift_entry_type: "Manual_Entry" so it's never confused with a normal EVV
// GPS punch, and carries the same editor/timestamp tracking as an admin edit
// (edited_by / edited_by_admin_name / edited_at / is_edited_by_admin).
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlusCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EVV_SERVICE_CODES, padMemberId } from "@/lib/evv-codes";
import { toast } from "sonner";

type StaffOption = { value: string; label: string };

export function ManualTimesheetDialog({
  mode, organizationId, currentStaffId, staffOptions, triggerLabel,
}: {
  mode: "admin" | "staff";
  organizationId: string;
  /** Required when mode === "staff" — the acting staff member's own id. */
  currentStaffId?: string;
  /** Required when mode === "admin" — every staff member to choose from. */
  staffOptions?: StaffOption[];
  triggerLabel?: string;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState(mode === "staff" ? (currentStaffId ?? "") : "");
  const [clientId, setClientId] = useState("");
  const [svc, setSvc] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (mode === "staff") setStaffId(currentStaffId ?? "");
  }, [mode, currentStaffId]);

  const clientsQ = useQuery({
    enabled: open && !!organizationId,
    queryKey: ["manual-entry-clients", organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, medicaid_id")
        .eq("organization_id", organizationId)
        .order("last_name");
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; medicaid_id: string | null }>;
    },
  });

  const reset = () => {
    setStaffId(mode === "staff" ? (currentStaffId ?? "") : "");
    setClientId(""); setSvc(""); setClockIn(""); setClockOut(""); setReason("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!staffId) throw new Error(mode === "admin" ? "Choose the staff member this entry is for." : "Missing staff id.");
      if (!clientId) throw new Error("Choose a client.");
      if (!svc) throw new Error("Choose a service code.");
      if (!clockIn) throw new Error("Enter a clock-in time.");
      if (!clockOut) throw new Error("Enter a clock-out time.");
      const inIso = new Date(clockIn).toISOString();
      const outIso = new Date(clockOut).toISOString();
      if (new Date(outIso).getTime() <= new Date(inIso).getTime()) {
        throw new Error("Clock-out must be after clock-in.");
      }
      if (!reason.trim()) throw new Error("Explain why this entry is being added manually (e.g. missed clock-out).");

      const actorName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Staff member";
      const nowIso = new Date().toISOString();

      const { data: org } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("dhhs_provider_id" as any)
        .eq("id", organizationId)
        .single();
      const client = (clientsQ.data ?? []).find((c) => c.id === clientId);

      const staffLabel = mode === "admin" ? (staffOptions ?? []).find((s) => s.value === staffId)?.label ?? staffId : actorName;
      const creationNote = mode === "admin"
        ? `Manual timesheet entry created by ${actorName} on behalf of ${staffLabel}. Reason: ${reason.trim()}`
        : `Manual timesheet entry created by ${actorName} for a missed punch. Reason: ${reason.trim()}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("evv_timesheets") as any).insert({
        organization_id: organizationId,
        staff_id: staffId,
        client_id: clientId,
        service_type_code: svc,
        clock_in_timestamp: inIso,
        clock_out_timestamp: outIso,
        raw_clock_in: inIso,
        raw_clock_out: outIso,
        rounded_clock_in: inIso,
        rounded_clock_out: outIso,
        gps_in_coordinates: {},
        gps_out_coordinates: {},
        gps_validated: false,
        is_out_of_bounds: false,
        utah_medicaid_provider_id: (org as { dhhs_provider_id: string | null } | null)?.dhhs_provider_id ?? "MANUAL",
        utah_medicaid_member_id: padMemberId(client?.medicaid_id ?? ""),
        shift_entry_type: "Manual_Entry",
        status: "Approved",
        shift_note_text: reason.trim(),
        is_edited_by_admin: mode === "admin",
        edited_by: user?.id ?? null,
        edited_by_admin_name: actorName,
        edited_at: nowIso,
        edit_audit_history_log: [{ timestamp: nowIso, admin: actorName, field_changed: "created", old_value: "", new_value: creationNote }],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manual timesheet entry added.");
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["my-time-corrections"] });
      setOpen(false);
      reset();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-2">
          <PlusCircle className="h-4 w-4" /> {triggerLabel ?? (mode === "admin" ? "Add timesheet manually" : "Log a missed timesheet")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "admin" ? "Add a manual timesheet" : "Log a missed timesheet"}</DialogTitle>
          <DialogDescription>
            This creates a real record, clearly marked as manually entered so it's never confused with a GPS-verified EVV punch.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {mode === "admin" && (
            <div>
              <Label>Staff member</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {(staffOptions ?? []).map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {(clientsQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Service code</Label>
            <Select value={svc} onValueChange={setSvc}>
              <SelectTrigger><SelectValue placeholder="Select code" /></SelectTrigger>
              <SelectContent>
                {EVV_SERVICE_CODES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Clock in</Label>
              <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
            </div>
            <div>
              <Label>Clock out</Label>
              <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reason this is manual (required)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. I forgot to clock in — I actually arrived at 9:05 AM."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
