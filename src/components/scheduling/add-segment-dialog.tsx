import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { classesForCode, familyForCode, isDailyCode } from "@/lib/scheduling/code-colors";
import { listClientAuthorizedCodes } from "@/lib/scheduling/client-codes.functions";
import { createShift } from "@/lib/scheduling/shifts.functions";

export interface ParentShiftInfo {
  id: string;
  client_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  location_id: string | null;
  service_code?: string | null;
  job_code?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  parent: ParentShiftInfo | null;
  onCreated?: () => void;
}

function toLocalIso(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function pickerToIso(p: string) {
  return new Date(p).toISOString();
}
function durationHours(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
}

/**
 * AddSegmentDialog — creates a 1:1 segment under an existing parent shift.
 * Staff is locked to parent staff, client locked to parent client, code list
 * restricted to hourly authorized codes for the client, time constrained
 * within the parent window.
 */
export function AddSegmentDialog({ open, onOpenChange, organizationId, parent, onCreated }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [startPicker, setStartPicker] = useState("");
  const [endPicker, setEndPicker] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && parent) {
      setCode(null);
      setNotes("");
      setStartPicker(toLocalIso(new Date(parent.starts_at)));
      const end = new Date(parent.starts_at);
      end.setHours(end.getHours() + 1);
      const cap = new Date(parent.ends_at);
      setEndPicker(toLocalIso(end > cap ? cap : end));
    }
  }, [open, parent]);

  const createCall = useServerFn(createShift);
  const listCodesCall = useServerFn(listClientAuthorizedCodes);

  const codesQ = useQuery({
    enabled: open && !!parent?.client_id,
    queryKey: ["client-auth-codes", organizationId, parent?.client_id],
    queryFn: () => listCodesCall({ data: { organizationId, clientId: parent!.client_id } }),
  });

  // Hourly only — daily codes cannot be segments.
  const hourlyCodes = useMemo(
    () => (codesQ.data ?? []).filter((r) => !isDailyCode(r.service_code)),
    [codesQ.data],
  );

  const hrs = useMemo(() => durationHours(startPicker, endPicker), [startPicker, endPicker]);

  const parentStart = parent ? new Date(parent.starts_at).getTime() : 0;
  const parentEnd = parent ? new Date(parent.ends_at).getTime() : 0;
  const segStart = startPicker ? new Date(startPicker).getTime() : 0;
  const segEnd = endPicker ? new Date(endPicker).getTime() : 0;
  const inWindow = parent && segStart >= parentStart && segEnd <= parentEnd && segEnd > segStart;

  async function handleCreate() {
    if (!parent || !parent.staff_id || !code || !inWindow) return;
    setSubmitting(true);
    try {
      await createCall({
        data: {
          organizationId,
          clientId: parent.client_id,
          serviceCode: code,
          staffId: parent.staff_id,
          startsAtIso: pickerToIso(startPicker),
          endsAtIso: pickerToIso(endPicker),
          locationId: parent.location_id,
          parentShiftId: parent.id,
          status: "draft",
          createdFrom: "manual",
          notes: notes.trim() || undefined,
        },
      });
      toast.success("Segment added");
      onCreated?.();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not add segment");
    } finally {
      setSubmitting(false);
    }
  }

  const parentCode = parent?.service_code ?? parent?.job_code ?? "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add 1:1 segment</DialogTitle>
          <DialogDescription>
            Adds a billable segment inside an existing shift. Same staff, same client,
            time constrained to the parent window.
          </DialogDescription>
        </DialogHeader>

        {parent && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Parent: {parentCode}</span>
              <Badge variant="outline" className="text-[10px] capitalize">{familyForCode(parentCode).replace("_", " ")}</Badge>
            </div>
            <div className="mt-0.5 font-medium text-muted-foreground tabular-nums">
              {new Date(parent.starts_at).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              {" – "}
              {new Date(parent.ends_at).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Service code (hourly only)</Label>
          {codesQ.isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading codes…</div>
          ) : hourlyCodes.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No hourly authorizations for this client.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {hourlyCodes.map((row) => {
                const c = row.service_code;
                const fc = classesForCode(c);
                const on = code === c;
                return (
                  <button
                    key={row.id}
                    onClick={() => setCode(c)}
                    className={cn(
                      "min-h-[44px] rounded-md border p-2 text-left text-sm transition-colors",
                      on ? `${fc.border} ${fc.bgSoft} ring-2 ${fc.ring}` : "border-border hover:bg-muted",
                    )}
                  >
                    <div className="font-bold">{c}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{familyForCode(c).replace("_", " ")}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Start</Label>
            <Input
              type="datetime-local"
              value={startPicker}
              min={parent ? toLocalIso(new Date(parent.starts_at)) : undefined}
              max={parent ? toLocalIso(new Date(parent.ends_at)) : undefined}
              onChange={(e) => setStartPicker(e.target.value)}
            />
          </div>
          <div>
            <Label>End</Label>
            <Input
              type="datetime-local"
              value={endPicker}
              min={parent ? toLocalIso(new Date(parent.starts_at)) : undefined}
              max={parent ? toLocalIso(new Date(parent.ends_at)) : undefined}
              onChange={(e) => setEndPicker(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-semibold tabular-nums">{hrs.toFixed(2)} h</span>
        </div>
        {!inWindow && startPicker && endPicker && (
          <div className="text-xs text-destructive">Segment must fall inside the parent window.</div>
        )}

        <div>
          <Label className="text-xs">Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What this segment is for" />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={submitting || !code || !inWindow || !parent?.staff_id}
          >
            {submitting ? "Adding…" : "Add segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
