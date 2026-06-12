import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Trash2, Info } from "lucide-react";
import {
  listLocations,
  listCoverageRequirements,
  upsertCoverageRequirement,
  deleteCoverageRequirement,
} from "@/lib/scheduling/locations.functions";
import { computeRequiredStaff } from "@/lib/coverage.functions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(d: number | null) {
  return d === null || d === undefined ? "Every day" : DAYS[d] ?? "?";
}

/**
 * Coverage requirements editor — per-location windows that must be staffed.
 * Drives the red "uncovered" overlay on the residential coverage bars.
 */
export function CoverageRequirementsDialog({ open, onOpenChange, organizationId }: Props) {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState<string | null>(null);

  // Draft for new requirement
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("08:00");
  const [requiredStaffCount, setRequiredStaffCount] = useState("1");
  const [awakeRequired, setAwakeRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const listLocCall = useServerFn(listLocations);
  const listReqCall = useServerFn(listCoverageRequirements);
  const upsertCall = useServerFn(upsertCoverageRequirement);
  const deleteCall = useServerFn(deleteCoverageRequirement);

  const locsQ = useQuery({
    enabled: open,
    queryKey: ["locations", organizationId],
    queryFn: () => listLocCall({ data: { organizationId } }),
  });

  const reqsQ = useQuery({
    enabled: open && !!locationId,
    queryKey: ["coverage-reqs", organizationId, locationId],
    queryFn: () => listReqCall({ data: { organizationId, locationId: locationId! } }),
  });

  const computeCall = useServerFn(computeRequiredStaff);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const computedQ = useQuery({
    enabled: open && !!locationId,
    queryKey: ["computed-required", organizationId, locationId, todayIso],
    queryFn: () => computeCall({ data: { locationId: locationId!, startDate: todayIso } }),
  });

  const locations = useMemo(() => locsQ.data ?? [], [locsQ.data]);
  const activeLoc = locations.find((l) => l.id === locationId) ?? null;
  const isResidential = activeLoc?.type === "residential";

  // Build a short human summary of today's computed requirement curve.
  const computedSummary = useMemo(() => {
    const day = computedQ.data?.days?.[0];
    if (!day) return null;
    const mins = day.required;
    if (!mins?.length) return null;
    const baseline = mins[12 * 60] ?? mins[0] ?? 0;
    const segments: Array<{ from: number; to: number; n: number }> = [];
    let i = 0;
    while (i < mins.length) {
      const v = mins[i];
      if (v !== baseline) {
        const start = i;
        while (i < mins.length && mins[i] === v) i++;
        segments.push({ from: start, to: i, n: v });
      } else i++;
    }
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const segText = segments.slice(0, 2).map((s) => `${s.n} staff ${fmt(s.from)}–${fmt(s.to)}`).join(" · ");
    return segText
      ? `${baseline} staff baseline · drops/rises to ${segText}`
      : `${baseline} staff while all residents are home`;
  }, [computedQ.data]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["coverage-reqs", organizationId, locationId] });

  function applyPreset(p: "awake-overnight" | "min-1-24h" | "three-bands") {
    if (p === "awake-overnight") {
      setDayOfWeek(null); setStartTime("23:00"); setEndTime("07:00");
      setRequiredStaffCount("1"); setAwakeRequired(true);
    } else if (p === "min-1-24h") {
      setDayOfWeek(null); setStartTime("00:00"); setEndTime("24:00");
      setRequiredStaffCount("1"); setAwakeRequired(false);
    } else {
      setDayOfWeek(null); setStartTime("07:00"); setEndTime("23:00");
      setRequiredStaffCount("1"); setAwakeRequired(false);
    }
  }


  async function handleAdd() {
    if (!locationId) return;
    const n = Number(requiredStaffCount);
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      toast.error("Use HH:MM time format");
      return;
    }
    if (Number.isNaN(n) || n < 0 || n > 20) {
      toast.error("Required staff must be 0–20");
      return;
    }
    setSaving(true);
    try {
      await upsertCall({
        data: {
          organizationId, locationId, dayOfWeek,
          startTime, endTime, requiredStaffCount: n, awakeRequired,
        },
      });
      toast.success("Requirement added");
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCall({ data: { id } });
      toast.success("Removed");
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Coverage requirements</DialogTitle>
          <DialogDescription>
            Set staffing windows per location. Uncovered windows show as red on
            the residential coverage bars.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Location</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {locsQ.isLoading ? (
                <span className="text-sm text-muted-foreground">Loading…</span>
              ) : locations.length === 0 ? (
                <span className="text-sm text-muted-foreground">No locations yet. Add homes first.</span>
              ) : locations.map((l) => {
                const on = locationId === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => setLocationId(l.id)}
                    className={`min-h-[36px] rounded-md border px-2 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                  >
                    {l.name}
                    <Badge variant="outline" className="ml-1 text-[9px] capitalize">{(l.type ?? "").replace("_", " ")}</Badge>
                  </button>
                );
              })}
            </div>
          </div>

          {locationId && (
            <>
              {!isResidential && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  Coverage requirements only enforce red gaps on residential locations. You can still
                  record them here for {activeLoc?.type?.replace("_", " ")}, but the board won't flag them.
                </div>
              )}

              <div className="rounded-md border divide-y">
                {reqsQ.isLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">Loading…</div>
                ) : (reqsQ.data ?? []).length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No requirements yet.</div>
                ) : (reqsQ.data ?? []).map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{dayLabel(r.day_of_week)}</Badge>
                      <span className="font-semibold tabular-nums">{r.start_time}–{r.end_time}</span>
                      <span className="text-muted-foreground">· {r.required_staff_count} staff</span>
                      {r.awake_required && <Badge variant="outline" className="text-[10px]">awake</Badge>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(r.id)} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <Label className="text-xs">Add requirement</Label>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setDayOfWeek(null)}
                    className={`min-h-[36px] rounded-md border px-2 text-xs font-semibold ${dayOfWeek === null ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                  >
                    Every day
                  </button>
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      onClick={() => setDayOfWeek(i)}
                      className={`min-h-[36px] w-11 rounded-md border text-xs font-semibold ${dayOfWeek === i ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Start</Label>
                    <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">End</Label>
                    <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Staff #</Label>
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      value={requiredStaffCount}
                      onChange={(e) => setRequiredStaffCount(e.target.value)}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={awakeRequired} onCheckedChange={(v) => setAwakeRequired(!!v)} />
                  Awake overnight required
                </label>
                <Button onClick={handleAdd} disabled={saving} className="w-full sm:w-auto">
                  {saving ? "Saving…" : "Add requirement"}
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
