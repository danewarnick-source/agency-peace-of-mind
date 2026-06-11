import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { classesForCode, familyForCode, isDailyCode } from "@/lib/scheduling/code-colors";
import { listShiftsInRange } from "@/lib/scheduling/shifts.functions";
import { listCoverageRequirements } from "@/lib/scheduling/locations.functions";
import { AddSegmentDialog, type ParentShiftInfo } from "@/components/scheduling/add-segment-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  day: Date | null;
  locationId?: string | null;
  locationName?: string;
  onCreateClick?: (day: Date) => void;
  onShiftClick?: (shiftId: string) => void;
}

const HOUR_HEIGHT = 32;

/**
 * Day Timeline Drawer — vertical 00:00→24:00 axis with shifts as positioned
 * blocks. Single-source visual editor for a single day at a single location.
 * Phase 1: click-to-create + click-to-edit (drag/resize comes in Phase 2).
 */
export function DayTimelineDrawer({
  open, onOpenChange, organizationId, day, locationId, locationName, onCreateClick, onShiftClick,
}: Props) {
  const listCall = useServerFn(listShiftsInRange);
  const listReqsCall = useServerFn(listCoverageRequirements);
  const [segParent, setSegParent] = useState<ParentShiftInfo | null>(null);

  const dayStartIso = useMemo(() => {
    if (!day) return null;
    const d = new Date(day); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, [day]);
  const dayEndIso = useMemo(() => {
    if (!day) return null;
    const d = new Date(day); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.toISOString();
  }, [day]);

  const shiftsQ = useQuery({
    enabled: open && !!dayStartIso && !!dayEndIso,
    queryKey: ["day-timeline", organizationId, dayStartIso, dayEndIso, locationId],
    queryFn: () => listCall({
      data: {
        organizationId,
        startIso: dayStartIso!,
        endIso: dayEndIso!,
        locationId: locationId ?? undefined,
      },
    }),
  });

  const reqsQ = useQuery({
    enabled: open && !!locationId,
    queryKey: ["coverage-reqs", organizationId, locationId],
    queryFn: () => listReqsCall({ data: { organizationId, locationId: locationId! } }),
  });

  const dayStartMs = day ? new Date(day).setHours(0, 0, 0, 0) : 0;
  const dow = day ? day.getDay() : -1;

  // Compute uncovered minute bands (matched against requirements that apply today).
  const gaps = useMemo(() => {
    const reqs = (reqsQ.data ?? []).filter(
      (r) => r.day_of_week === null || r.day_of_week === undefined || r.day_of_week === dow,
    );
    if (reqs.length === 0) return [] as Array<{ topPct: number; heightPct: number }>;
    const minutes = new Array(24 * 60).fill(0);
    for (const s of shiftsQ.data ?? []) {
      if (!s.staff_id) continue;
      const s0 = Math.max(new Date(s.starts_at).getTime(), dayStartMs);
      const s1 = Math.min(new Date(s.ends_at).getTime(), dayStartMs + 86400000);
      if (s1 <= s0) continue;
      const m0 = Math.floor((s0 - dayStartMs) / 60000);
      const m1 = Math.ceil((s1 - dayStartMs) / 60000);
      for (let i = m0; i < m1; i++) minutes[i] += 1;
    }
    const required = new Array(24 * 60).fill(0);
    for (const r of reqs) {
      const [sh, sm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      const a = sh * 60 + sm;
      const b = eh === 0 && em === 0 ? 24 * 60 : eh * 60 + em;
      for (let i = a; i < b; i++) required[i] = Math.max(required[i], r.required_staff_count);
    }
    const out: Array<{ topPct: number; heightPct: number }> = [];
    let i = 0;
    while (i < 24 * 60) {
      if (required[i] > minutes[i]) {
        const start = i;
        while (i < 24 * 60 && required[i] > minutes[i]) i++;
        out.push({ topPct: (start / (24 * 60)) * 100, heightPct: ((i - start) / (24 * 60)) * 100 });
      } else i++;
    }
    return out;
  }, [reqsQ.data, shiftsQ.data, dayStartMs, dow]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {day ? day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "Day timeline"}
          </SheetTitle>
          <SheetDescription>
            {locationName ?? "All shifts"} · {shiftsQ.data?.length ?? 0} shifts
          </SheetDescription>
        </SheetHeader>

        {day && (
          <div className="mt-4 mb-3">
            <Button size="sm" className="w-full" onClick={() => onCreateClick?.(day)}>
              + Add shift on this day
            </Button>
          </div>
        )}

        <div className="relative mt-2" style={{ height: HOUR_HEIGHT * 24 }}>
          {/* Hour grid */}
          {Array.from({ length: 25 }, (_, h) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-border/60 text-[10px] font-medium text-muted-foreground tabular-nums"
              style={{ top: h * HOUR_HEIGHT }}
            >
              <span className="absolute -top-2 left-0 bg-background px-1">
                {h.toString().padStart(2, "0")}:00
              </span>
            </div>
          ))}

          {/* Shift blocks */}
          <div className="absolute inset-y-0 left-12 right-2">
            {(shiftsQ.data ?? []).map((s) => {
              const s0 = new Date(s.starts_at).getTime();
              const s1 = new Date(s.ends_at).getTime();
              const top = ((s0 - dayStartMs) / 3600000) * HOUR_HEIGHT;
              const height = Math.max(20, ((s1 - s0) / 3600000) * HOUR_HEIGHT);
              const cls = classesForCode(s.service_code ?? s.job_code);
              const isOpen = !s.staff_id;
              const code = (s.service_code ?? s.job_code ?? "—").toString();
              const isSegment = !!s.parent_shift_id;
              const canAddSegment = !isOpen && !isSegment && !isDailyCode(code) && !!s.client_id;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "absolute left-0 right-0 rounded-md border-l-4 px-2 py-1 text-[11px] font-semibold transition-colors min-h-[44px]",
                    isSegment && "ml-3",
                    isOpen ? "bg-destructive/10 border-destructive text-destructive" : `${cls.bgSoft} ${cls.border} ${cls.text}`,
                  )}
                  style={{ top, height }}
                >
                  <button
                    type="button"
                    onClick={() => onShiftClick?.(s.id)}
                    className="block w-full text-left hover:brightness-95"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{code}{isSegment && " · seg"}</span>
                      <Badge variant="outline" className="text-[9px] capitalize">{familyForCode(code).replace("_", " ")}</Badge>
                    </div>
                    <div className="text-[10px] font-medium opacity-80">
                      {new Date(s.starts_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}–
                      {new Date(s.ends_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {isOpen && " · open"}
                    </div>
                  </button>
                  {canAddSegment && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSegParent({
                          id: s.id,
                          client_id: s.client_id!,
                          staff_id: s.staff_id,
                          starts_at: s.starts_at,
                          ends_at: s.ends_at,
                          location_id: s.location_id ?? null,
                          service_code: s.service_code,
                          job_code: s.job_code,
                        });
                      }}
                      className="absolute right-1 bottom-1 rounded bg-background/80 border border-border px-1.5 py-0.5 text-[10px] font-semibold hover:bg-background"
                      title="Add 1:1 segment inside this shift"
                    >
                      + seg
                    </button>
                  )}
                </div>
              );
            })}
            {shiftsQ.isLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            )}
            {!shiftsQ.isLoading && (shiftsQ.data ?? []).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No shifts on this day</div>
            )}
          </div>
        </div>
      </SheetContent>
      <AddSegmentDialog
        open={!!segParent}
        onOpenChange={(v) => { if (!v) setSegParent(null); }}
        organizationId={organizationId}
        parent={segParent}
        onCreated={() => { setSegParent(null); shiftsQ.refetch(); }}
      />
    </Sheet>
  );
}
