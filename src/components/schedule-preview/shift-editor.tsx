import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import {
  saveShift, deleteShift, type ShiftDraft,
} from "@/lib/schedule-preview-mutations";
import { isDaily, type ShiftRow, type ClientRow, type StaffRow } from "@/hooks/use-schedule-preview";

export type EditorContext = {
  shift?: ShiftRow;        // existing
  day?: Date;              // quick-add anchor
  staffId?: string | null; // quick-add context
  clientId?: string | null;
};

function toLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}
function fromLocalInput(s: string): string {
  return new Date(s).toISOString();
}
function defaultRange(day: Date): { start: string; end: string } {
  const s = new Date(day); s.setHours(9, 0, 0, 0);
  const e = new Date(day); e.setHours(17, 0, 0, 0);
  return { start: toLocalInput(s), end: toLocalInput(e) };
}

export function ShiftEditorDialog({
  open, onOpenChange, ctx, clients, staff, siteId, weekStartIso,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  ctx: EditorContext | null;
  clients: ClientRow[];     // all clients (for site-scoped picker)
  staff: StaffRow[];
  siteId: string;           // the currently selected site, or "__all__"
  weekStartIso: string;     // for query invalidation
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? "";
  const editing = ctx?.shift ?? null;

  // Site-scoped client list when a site is picked. When "All sites", show all.
  const eligibleClients = useMemo(() => {
    if (siteId === "__all__") return clients;
    if (siteId === "__unassigned__") return clients.filter((c) => !c.team_id);
    return clients.filter((c) => c.team_id === siteId);
  }, [clients, siteId]);

  const [staffId, setStaffId] = useState("");
  const [clientId, setClientId] = useState("");
  const [jobCode, setJobCode] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [notes, setNotes] = useState("");
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStaffId(editing.staff_id ?? "");
      setClientId(editing.client_id ?? "");
      setJobCode(editing.job_code ?? "");
      setStarts(toLocalInput(editing.starts_at));
      setEnds(toLocalInput(editing.ends_at));
      setNotes("");
      setPublished(!!editing.published);
    } else {
      const day = ctx?.day ?? new Date();
      const r = defaultRange(day);
      setStaffId(ctx?.staffId ?? "");
      setClientId(ctx?.clientId ?? "");
      setJobCode("");
      setStarts(r.start);
      setEnds(r.end);
      setNotes("");
      setPublished(false);
    }
  }, [open, editing, ctx]);

  const selectedClient = eligibleClients.find((c) => c.id === clientId) ?? clients.find((c) => c.id === clientId);
  const authorizedCodes = selectedClient?.job_code ?? [];
  // Filter the master EVV code list to ones authorized for this client.
  const codeChoices = useMemo(
    () => EVV_SERVICE_CODES.filter((c) => authorizedCodes.includes(c.code)),
    [authorizedCodes],
  );

  // Reset code if not in authorized list
  useEffect(() => {
    if (jobCode && authorizedCodes.length && !authorizedCodes.includes(jobCode)) setJobCode("");
  }, [jobCode, authorizedCodes]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["schedule-preview", orgId, weekStartIso] });

  const save = useMutation({
    mutationFn: async () => {
      const draft: ShiftDraft = {
        id: editing?.id,
        organization_id: orgId,
        staff_id: staffId,
        client_id: clientId,
        job_code: jobCode,
        // Mirror the existing scheduler: daily codes use 'daily_host_home',
        // everything else defaults to 'hourly'.
        shift_type: isDaily(jobCode) ? "daily_host_home" : "hourly",
        starts_at: starts ? fromLocalInput(starts) : "",
        ends_at: ends ? fromLocalInput(ends) : "",
        notes: notes || null,
        status: editing?.status ?? "pending",
        published,
        created_by: user?.id ?? "",
      };
      return saveShift(draft);
    },
    onSuccess: () => {
      toast.success(editing ? "Shift updated." : "Shift created.");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not save shift."),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await deleteShift(editing.id, orgId);
    },
    onSuccess: () => {
      toast.success("Shift deleted.");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete shift."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit shift" : "Add shift"}</DialogTitle>
          <DialogDescription>
            Writes to <code>scheduled_shifts</code> using the same fields as the existing scheduler.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label>Client / individual</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select a person" /></SelectTrigger>
              <SelectContent>
                {eligibleClients.length === 0 && <SelectItem value="__none__" disabled>No people at this site</SelectItem>}
                {eligibleClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Staff</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              scheduled_shifts.staff_id is NOT NULL, so this app has no "open" shift state — a staffer is required.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Billing code</Label>
            <Select value={jobCode} onValueChange={setJobCode} disabled={!clientId}>
              <SelectTrigger>
                <SelectValue placeholder={clientId ? "Select an authorized code" : "Pick a client first"} />
              </SelectTrigger>
              <SelectContent>
                {codeChoices.length === 0 && clientId && (
                  <SelectItem value="__none__" disabled>This client has no authorized codes</SelectItem>
                )}
                {codeChoices.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Start</Label>
              <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>End</Label>
              <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="Optional" />
          </div>

          <div className="flex items-center justify-between rounded-md border p-2">
            <div>
              <Label className="text-sm">Published</Label>
              <p className="text-[11px] text-muted-foreground">Unpublished shifts stay as drafts.</p>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { if (confirm("Delete this shift?")) del.mutate(); }}
                disabled={del.isPending}
                className="text-destructive border-destructive/30"
              >
                {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
