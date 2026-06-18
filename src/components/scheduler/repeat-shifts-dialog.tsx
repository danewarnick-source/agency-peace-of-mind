// Copy shifts dialog — pull from previous week / previous month / pick a week,
// weekday-align onto the current visible week, review drafts row-by-row,
// then apply (optionally publishing immediately).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Copy, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { previewRepeat, applyRepeat } from "@/lib/scheduler/repeat.functions";

type SourceMode = "prev_week" | "prev_month" | "pick_week";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; } // Monday-aligned (Mon=0)
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function dayKey(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function RepeatShiftsDialog({
  open, onClose, organizationId, anchor, clientNameById, staffNameById,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  anchor: Date;
  clientNameById: Map<string, string>;
  staffNameById: Map<string, string>;
}) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewRepeat);
  const applyFn = useServerFn(applyRepeat);

  const targetWeekStart = useMemo(() => startOfWeek(anchor), [anchor]);

  const [mode, setMode] = useState<SourceMode>("prev_week");
  const [pickedDate, setPickedDate] = useState<string>(dayKey(addDays(targetWeekStart, -7)));
  const [keepStaff, setKeepStaff] = useState(true);
  const [skipIfExists, setSkipIfExists] = useState(true);
  const [publishNow, setPublishNow] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const window = useMemo(() => {
    if (mode === "prev_week") {
      const start = addDays(targetWeekStart, -7);
      return { start, end: addDays(start, 7) };
    }
    if (mode === "prev_month") {
      const prevMonth = new Date(targetWeekStart.getFullYear(), targetWeekStart.getMonth() - 1, 1);
      const monthEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 1);
      return { start: prevMonth, end: monthEnd };
    }
    const start = startOfWeek(new Date(pickedDate));
    return { start, end: addDays(start, 7) };
  }, [mode, pickedDate, targetWeekStart]);

  const previewMut = useMutation({
    mutationFn: () => previewFn({
      data: {
        organization_id: organizationId,
        source_start_iso: window.start.toISOString(),
        source_end_iso: window.end.toISOString(),
        target_week_start_iso: targetWeekStart.toISOString(),
      },
    }),
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => setExcluded(new Set()),
  });

  // Auto-preview when source window or open changes.
  useEffect(() => {
    if (!open) return;
    previewMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, pickedDate]);

  const projected = previewMut.data?.projected ?? [];
  const sourceCount = previewMut.data?.source_count ?? null;
  const includedIds = useMemo(
    () => projected.filter((p) => !excluded.has(p.id)).map((p) => p.id),
    [projected, excluded],
  );

  const applyMut = useMutation({
    mutationFn: () => applyFn({
      data: {
        organization_id: organizationId,
        source_start_iso: window.start.toISOString(),
        source_end_iso: window.end.toISOString(),
        target_week_start_iso: targetWeekStart.toISOString(),
        keep_staff: keepStaff,
        skip_if_exists: skipIfExists,
        publish_now: publishNow,
        include_source_ids: includedIds,
      },
    }),
    onSuccess: (r) => {
      toast.success(`Copied — ${r.inserted} shifts created${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRow = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExcluded(next);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" /> Copy shifts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Copy from</div>
              <Select value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prev_week">Previous week</SelectItem>
                  <SelectItem value="prev_month">Previous month</SelectItem>
                  <SelectItem value="pick_week">Pick a week…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "pick_week" && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Any date in source week
                </div>
                <Input type="date" value={pickedDate} onChange={(e) => setPickedDate(e.target.value)} />
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Source: <strong>{fmtDay(window.start)}</strong> – <strong>{fmtDay(addDays(window.end, -1))}</strong>
            {" → "}target week of <strong>{fmtDay(targetWeekStart)}</strong>
            {sourceCount !== null && <> · {sourceCount} shift{sourceCount === 1 ? "" : "s"} in source</>}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={keepStaff} onChange={(e) => setKeepStaff(e.target.checked)} className="h-4 w-4" />
              Keep staff assignments
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={skipIfExists} onChange={(e) => setSkipIfExists(e.target.checked)} className="h-4 w-4" />
              Skip duplicates
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} className="h-4 w-4" />
              Publish now
            </label>
          </div>

          <div className="border rounded-md max-h-[40vh] overflow-y-auto">
            {previewMut.isPending ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading shifts…
              </div>
            ) : projected.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No shifts to repeat from.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground sticky top-0 bg-background">
                  <tr>
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-2 py-2 text-left">Client</th>
                    <th className="px-2 py-2 text-left">Code</th>
                    <th className="px-2 py-2 text-left">Staff</th>
                    <th className="px-2 py-2 text-left">When</th>
                  </tr>
                </thead>
                <tbody>
                  {projected.slice(0, 200).map((p) => {
                    const start = new Date(p.target_starts_at);
                    const end = new Date(p.target_ends_at);
                    const code = p.service_code ?? p.job_code ?? "—";
                    const checked = !excluded.has(p.id);
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={checked} onChange={() => toggleRow(p.id)} className="h-4 w-4" />
                        </td>
                        <td className="px-2 py-1.5">{clientNameById.get(p.client_id) ?? "Client"}</td>
                        <td className="px-2 py-1.5 font-mono text-xs">{code}</td>
                        <td className="px-2 py-1.5">
                          {p.staff_id && keepStaff
                            ? (staffNameById.get(p.staff_id) ?? "Staff")
                            : <span className="italic text-muted-foreground">open</span>}
                        </td>
                        <td className="px-2 py-1.5 text-xs tabular-nums">
                          {fmtDay(start)} {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          – {end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                  {projected.length > 200 && (
                    <tr><td colSpan={5} className="px-2 py-2 text-xs text-muted-foreground text-center">
                      … and {projected.length - 200} more
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}><X className="h-4 w-4 mr-1" /> Cancel</Button>
          <Button
            onClick={() => applyMut.mutate()}
            disabled={applyMut.isPending || includedIds.length === 0}
          >
            {applyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {publishNow ? "Copy & publish" : "Copy as drafts"} ({includedIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
