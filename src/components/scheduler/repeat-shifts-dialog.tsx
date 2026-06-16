// Repeat Shifts dialog — pick a source range (day/week/month), pick target
// dates (N copies forward, or specific dates), review the projected shifts,
// then apply. Backed by previewRepeat / applyRepeat server fns.
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Repeat, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { previewRepeat, applyRepeat } from "@/lib/scheduler/repeat.functions";

type SourceMode = "day" | "week" | "month";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function dayKey(d: Date) { return d.toISOString().slice(0, 10); }

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

  const [mode, setMode] = useState<SourceMode>("week");
  const [sourceDate, setSourceDate] = useState<string>(dayKey(anchor));
  const [repeatCount, setRepeatCount] = useState<number>(4); // copies forward
  const [keepStaff, setKeepStaff] = useState(true);
  const [skipIfExists, setSkipIfExists] = useState(true);

  const window = useMemo(() => {
    const d = new Date(sourceDate);
    if (mode === "day") return { start: startOfDay(d), end: addDays(startOfDay(d), 1), unitDays: 1 };
    if (mode === "week") return { start: startOfWeek(d), end: addDays(startOfWeek(d), 7), unitDays: 7 };
    const ms = startOfMonth(d);
    const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 1);
    return { start: ms, end: me, unitDays: Math.round((me.getTime() - ms.getTime()) / 86_400_000) };
  }, [mode, sourceDate]);

  const targetDays = useMemo(() => {
    const out: string[] = [];
    for (let i = 1; i <= Math.max(1, Math.min(repeatCount, 52)); i++) {
      const d = addDays(window.start, i * window.unitDays);
      out.push(dayKey(d));
    }
    return out;
  }, [window, repeatCount]);

  const previewMut = useMutation({
    mutationFn: () => previewFn({
      data: {
        organization_id: organizationId,
        source_start_iso: window.start.toISOString(),
        source_end_iso: window.end.toISOString(),
        target_days: targetDays,
      },
    }),
    onError: (e: Error) => toast.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: () => applyFn({
      data: {
        organization_id: organizationId,
        source_start_iso: window.start.toISOString(),
        source_end_iso: window.end.toISOString(),
        target_days: targetDays,
        keep_staff: keepStaff,
        skip_if_exists: skipIfExists,
      },
    }),
    onSuccess: (r) => {
      toast.success(`Repeated — ${r.inserted} shifts created${r.skipped ? `, ${r.skipped} skipped` : ""}.`);
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projected = previewMut.data?.projected ?? [];
  const sourceCount = previewMut.data?.source_count ?? null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4" /> Repeat shifts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Source</div>
              <Select value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
                <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                {mode === "day" ? "Date" : mode === "week" ? "Any date in week" : "Any date in month"}
              </div>
              <Input type="date" value={sourceDate} onChange={(e) => setSourceDate(e.target.value)} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Repeat for next
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {mode === "day" ? "day(s)" : mode === "week" ? "week(s)" : "month(s)"}
                </span>
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Source window: <strong>{fmtDay(window.start)}</strong> – <strong>{fmtDay(addDays(window.end, -1))}</strong>
            {sourceCount !== null && <> · {sourceCount} shift{sourceCount === 1 ? "" : "s"} found</>}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={keepStaff} onChange={(e) => setKeepStaff(e.target.checked)} className="h-4 w-4" />
              Keep staff assignments
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={skipIfExists} onChange={(e) => setSkipIfExists(e.target.checked)} className="h-4 w-4" />
              Skip if duplicate exists
            </label>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => previewMut.mutate()}
              disabled={previewMut.isPending}
            >
              {previewMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Preview
            </Button>
          </div>

          {previewMut.data && (
            <div className="border rounded-md max-h-[40vh] overflow-y-auto">
              {projected.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No shifts in the source window — nothing to repeat.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground sticky top-0 bg-background">
                    <tr>
                      <th className="px-2 py-2 text-left">Client</th>
                      <th className="px-2 py-2 text-left">Code</th>
                      <th className="px-2 py-2 text-left">Staff</th>
                      <th className="px-2 py-2 text-left">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projected.slice(0, 200).map((p, i) => {
                      const start = new Date(p.target_starts_at);
                      const end = new Date(p.target_ends_at);
                      const code = p.service_code ?? p.job_code ?? "—";
                      return (
                        <tr key={i} className="border-t">
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
                      <tr><td colSpan={4} className="px-2 py-2 text-xs text-muted-foreground text-center">
                        … and {projected.length - 200} more
                      </td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}><X className="h-4 w-4 mr-1" /> Cancel</Button>
          <Button
            onClick={() => applyMut.mutate()}
            disabled={applyMut.isPending}
          >
            {applyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Apply ({projected.length || "preview first"})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
