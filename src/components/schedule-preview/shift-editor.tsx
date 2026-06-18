import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Loader2, Repeat } from "lucide-react";
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
  saveShift, deleteShift, saveWeeklyRecurringShift,
  fetchSeriesIdsForward, updateSeries, deleteSeries,
  type ShiftDraft,
} from "@/lib/schedule-preview-mutations";
import { isDaily, type ShiftRow, type ClientRow, type StaffRow } from "@/hooks/use-schedule-preview";
import { staffHasTimeOffOverlap } from "@/lib/schedule-requests";
import { AlertTriangle } from "lucide-react";
import { useClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { isDayProgramCode } from "@/lib/service-billing";

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
function toHHMM(s: string): string {
  // s is "YYYY-MM-DDTHH:MM" from datetime-local
  return s.slice(11, 16);
}
function defaultRange(day: Date): { start: string; end: string } {
  const s = new Date(day); s.setHours(9, 0, 0, 0);
  const e = new Date(day); e.setHours(17, 0, 0, 0);
  return { start: toLocalInput(s), end: toLocalInput(e) };
}
function toDateInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ShiftEditorDialog({
  open, onOpenChange, ctx, clients, staff, siteId, weekStartIso, approvedTimeOff,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  ctx: EditorContext | null;
  clients: ClientRow[];
  staff: StaffRow[];
  siteId: string;
  weekStartIso: string;
  approvedTimeOff?: Map<string, Array<[number, number]>>;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? "";
  const editing = ctx?.shift ?? null;
  const editingIsRecurring = !!editing?.is_recurring;

  // Show ALL org clients regardless of which site lane the dialog opened from.
  // Site lanes still organize the calendar view; scheduling itself is org-wide.
  const eligibleClients = useMemo(() => clients, [clients]);
  void siteId;

  const [staffId, setStaffId] = useState("");
  const [clientId, setClientId] = useState("");
  const [jobCode, setJobCode] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [notes, setNotes] = useState("");
  const [published, setPublished] = useState(false);

  // Recurrence (create only — edit cannot change the rule, only scope)
  const [repeat, setRepeat] = useState<"none" | "weekly">("none");
  const [dows, setDows] = useState<number[]>([]);
  const [endDate, setEndDate] = useState<string>("");

  // Edit scope when editing a recurring shift
  const [scope, setScope] = useState<"one" | "series">("one");

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
      setRepeat("none"); // editing path uses scope toggle instead
      setDows([]);
      setEndDate("");
      setScope("one");
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
      setRepeat("none");
      setDows([day.getDay()]);
      // Default end-date = 4 weeks out
      const ed = new Date(day); ed.setDate(ed.getDate() + 28);
      setEndDate(toDateInput(ed));
      setScope("one");
    }
  }, [open, editing, ctx]);

  // Keep DOW selection in sync with the seed weekday on create
  useEffect(() => {
    if (editing || !starts) return;
    const seedDow = new Date(starts).getDay();
    setDows((prev) => (prev.includes(seedDow) ? prev : [...prev, seedDow].sort()));
  }, [starts, editing]);

  const selectedClient = eligibleClients.find((c) => c.id === clientId) ?? clients.find((c) => c.id === clientId);
  const billingCodesQ = useClientBillingCodes(selectedClient?.id);
  const authorizedCodes = (billingCodesQ.data ?? []).map((b) => b.service_code);
  const codeChoices = useMemo(
    () => {
      if (!authorizedCodes.length) return []; // no authorized codes — caller will show message
      return EVV_SERVICE_CODES.filter(
        (c) => authorizedCodes.includes(c.code) && !isDayProgramCode(c.code),
      );
    },
    [authorizedCodes],
  );

  useEffect(() => {
    if (jobCode && authorizedCodes.length && !authorizedCodes.includes(jobCode)) setJobCode("");
  }, [jobCode, authorizedCodes]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["schedule-preview", orgId, weekStartIso] });

  function toggleDow(d: number) {
    setDows((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  const save = useMutation({
    mutationFn: async () => {
      const baseDraft: ShiftDraft = {
        id: editing?.id,
        organization_id: orgId,
        staff_id: staffId,
        client_id: clientId,
        job_code: jobCode,
        service_code: jobCode,
        shift_type: isDaily(jobCode) ? "daily_host_home" : "hourly",
        starts_at: starts ? fromLocalInput(starts) : "",
        ends_at: ends ? fromLocalInput(ends) : "",
        notes: notes || null,
        status: editing?.status ?? "pending",
        published,
        created_by: user?.id ?? "",
      };

      // EDIT PATH
      if (editing) {
        if (editingIsRecurring && scope === "series") {
          // Bulk-edit this & all future matching occurrences in the series.
          const ids = await fetchSeriesIdsForward(
            {
              id: editing.id,
              client_id: editing.client_id,
              job_code: editing.job_code,
              starts_at: editing.starts_at,
            },
            orgId,
          );
          await updateSeries(ids, orgId, {
            staff_id: staffId,
            job_code: jobCode,
            shift_type: baseDraft.shift_type,
            notes: baseDraft.notes,
            published,
            startHHMM: toHHMM(starts),
            endHHMM: toHHMM(ends),
          });
          return { kind: "series-update", count: ids.length };
        }
        await saveShift(baseDraft);
        return { kind: "single-update", count: 1 };
      }

      // CREATE PATH
      if (repeat === "weekly") {
        if (!endDate) throw new Error("Pick a recurrence end date.");
        const count = await saveWeeklyRecurringShift(baseDraft, {
          daysOfWeek: dows,
          endDateISO: new Date(endDate).toISOString(),
        });
        return { kind: "series-create", count };
      }
      await saveShift(baseDraft);
      return { kind: "single-create", count: 1 };
    },
    onSuccess: (r) => {
      if (r.kind === "series-create")
        toast.success(`Created ${r.count} shift${r.count === 1 ? "" : "s"} in the series.`);
      else if (r.kind === "series-update")
        toast.success(`Updated ${r.count} occurrence${r.count === 1 ? "" : "s"}.`);
      else toast.success(editing ? "Shift updated." : "Shift created.");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not save shift."),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!editing) return { count: 0 };
      if (editingIsRecurring && scope === "series") {
        const ids = await fetchSeriesIdsForward(
          {
            id: editing.id,
            client_id: editing.client_id,
            job_code: editing.job_code,
            starts_at: editing.starts_at,
          },
          orgId,
        );
        await deleteSeries(ids, orgId);
        return { count: ids.length };
      }
      await deleteShift(editing.id, orgId);
      return { count: 1 };
    },
    onSuccess: (r) => {
      toast.success(
        r.count > 1 ? `Deleted ${r.count} occurrences.` : "Shift deleted.",
      );
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Could not delete shift."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit shift" : "Add shift"}</DialogTitle>
          <DialogDescription>
            Writes to <code>scheduled_shifts</code> using the same fields as the existing scheduler.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {editing && editingIsRecurring && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="mb-1 font-semibold flex items-center gap-1">
                <Repeat className="h-3.5 w-3.5" /> Recurring shift — apply changes to:
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setScope("one")}
                  className={`min-h-[44px] flex-1 rounded border px-2 text-xs font-semibold ${
                    scope === "one"
                      ? "border-[#137182] bg-[#137182] text-white"
                      : "border-border bg-background"
                  }`}
                >
                  This occurrence only
                </button>
                <button
                  type="button"
                  onClick={() => setScope("series")}
                  className={`min-h-[44px] flex-1 rounded border px-2 text-xs font-semibold ${
                    scope === "series"
                      ? "border-[#137182] bg-[#137182] text-white"
                      : "border-border bg-background"
                  }`}
                >
                  This &amp; all future in series
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Client / individual</Label>
            <Select value={clientId} onValueChange={setClientId} disabled={!!editing}>
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

          {approvedTimeOff && staffId && starts && ends &&
            staffHasTimeOffOverlap(approvedTimeOff, staffId, fromLocalInput(starts), fromLocalInput(ends)) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Heads up — this staffer has approved time off overlapping this shift. You can still save; this is advisory only.
              </span>
            </div>
          )}

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

          {/* Recurrence — create-time only. Editing scope is handled above. */}
          {!editing && (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-1.5">
                  <Repeat className="h-4 w-4" /> Repeat
                </Label>
                <Select value={repeat} onValueChange={(v) => setRepeat(v as "none" | "weekly")}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Does not repeat</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {repeat === "weekly" && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">Days of week</Label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {DOW_LABELS.map((lbl, idx) => {
                        const on = dows.includes(idx);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleDow(idx)}
                            title={DOW_FULL[idx]}
                            className={`min-h-[44px] min-w-[44px] rounded-md border px-2 text-xs font-semibold ${
                              on
                                ? "border-[#137182] bg-[#137182] text-white"
                                : "border-border bg-background hover:bg-accent"
                            }`}
                          >
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Repeat until</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={starts ? starts.slice(0, 10) : undefined}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Creates one shift per checked weekday, each week, through the end date. Same fields as the existing scheduler.
                  </p>
                </>
              )}
            </div>
          )}

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
                onClick={() => {
                  const msg = editingIsRecurring && scope === "series"
                    ? "Delete this and all future occurrences in the series?"
                    : "Delete this shift?";
                  if (confirm(msg)) del.mutate();
                }}
                disabled={del.isPending}
                className="text-destructive border-destructive/30 min-h-[44px]"
              >
                {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]">Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="min-h-[44px]">
              {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editing ? "Save" : repeat === "weekly" ? "Create series" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
