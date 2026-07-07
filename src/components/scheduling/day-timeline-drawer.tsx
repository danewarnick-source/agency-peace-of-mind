import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { classesForCode, isDailyCode } from "@/lib/scheduling/code-colors";
import { listShiftsInRange, updateShift } from "@/lib/scheduling/shifts.functions";
import { listCoverageRequirements, listLocations } from "@/lib/scheduling/locations.functions";
import { coverageCountMinutes, requiredMinutes, uncoveredBands } from "@/lib/scheduling/coverage-count";
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

type DrawerShift = {
  id: string;
  staff_id: string | null;
  client_id: string | null;
  service_code: string | null;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  location_id: string | null;
  parent_shift_id: string | null;
};

const LANE_MIN_WIDTH = 760; // px — keeps the 24h axis usable, scrolls at 375px
const SNAP_MINUTES = 15;

function fmtT(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Day Timeline Drawer — HORIZONTAL 00:00→24:00 axis with one swimlane per
 * staff member (+ an Open lane). Blocks are draggable along the axis
 * (15-minute snap; raw click still opens the editor). A required-coverage
 * band across the top shows red uncovered intervals against the location's
 * requirements; segments subtract their staff from the count. Mobile-safe:
 * the lane area scrolls horizontally at 375px.
 */
export function DayTimelineDrawer({
  open, onOpenChange, organizationId, day, locationId, locationName, onCreateClick, onShiftClick,
}: Props) {
  const listCall = useServerFn(listShiftsInRange);
  const listReqsCall = useServerFn(listCoverageRequirements);
  const listLocCall = useServerFn(listLocations);
  const updateCall = useServerFn(updateShift);
  const [segParent, setSegParent] = useState<ParentShiftInfo | null>(null);
  const [pickedLocId, setPickedLocId] = useState<string | null>(null);
  const effectiveLocId = pickedLocId ?? locationId ?? null;

  const locsQ = useQuery({
    enabled: open,
    queryKey: ["locations", organizationId],
    queryFn: () => listLocCall({ data: { organizationId } }),
  });

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
    queryKey: ["day-timeline", organizationId, dayStartIso, dayEndIso, effectiveLocId],
    queryFn: async () =>
      (await listCall({
        data: {
          organizationId,
          startIso: dayStartIso!,
          endIso: dayEndIso!,
          locationId: effectiveLocId ?? undefined,
        },
      })) as DrawerShift[],
  });

  const reqsQ = useQuery({
    enabled: open && !!effectiveLocId,
    queryKey: ["coverage-reqs", organizationId, effectiveLocId],
    queryFn: () => listReqsCall({ data: { organizationId, locationId: effectiveLocId! } }),
  });

  // Staff names for the lanes (profiles by id — never an org_members embed).
  const staffIds = useMemo(
    () => [...new Set((shiftsQ.data ?? []).map((s) => s.staff_id).filter((v): v is string => !!v))],
    [shiftsQ.data],
  );
  const staffNamesQ = useQuery({
    enabled: open && staffIds.length > 0,
    queryKey: ["day-timeline-staff", staffIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, full_name, photo_path")
        .in("id", staffIds);
      const m = new Map<string, { name: string; photo_path: string | null }>();
      for (const p of data ?? []) {
        const name = (p.full_name && p.full_name.trim())
          || [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
          || "Staff";
        m.set(p.id, { name, photo_path: (p.photo_path as string | null) ?? null });
      }
      return m;
    },
  });
  const staffName = (id: string | null) =>
    id ? (staffNamesQ.data?.get(id)?.name ?? "Staff") : "Open";
  const staffPhoto = (id: string | null) =>
    id ? (staffNamesQ.data?.get(id)?.photo_path ?? null) : null;

  const dayStartMs = day ? new Date(day).setHours(0, 0, 0, 0) : 0;
  const dow = day ? day.getDay() : -1;

  // Lanes: one per staff with shifts today, sorted by name; Open lane last.
  const lanes = useMemo(() => {
    const ids = [...new Set((shiftsQ.data ?? []).map((s) => s.staff_id).filter((v): v is string => !!v))];
    ids.sort((a, b) => staffName(a).localeCompare(staffName(b)));
    const out: Array<{ id: string | null; label: string; photo_path: string | null }> =
      ids.map((id) => ({ id, label: staffName(id), photo_path: staffPhoto(id) }));
    if ((shiftsQ.data ?? []).some((s) => !s.staff_id)) out.push({ id: null, label: "Open / unassigned", photo_path: null });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftsQ.data, staffNamesQ.data]);

  // Required-coverage band + red uncovered intervals (segments subtract).
  const coverage = useMemo(() => {
    const reqs = (reqsQ.data ?? []).filter(
      (r) => r.day_of_week === null || r.day_of_week === undefined || r.day_of_week === dow,
    );
    if (reqs.length === 0) return null;
    const required = requiredMinutes(reqs);
    const minutes = coverageCountMinutes(dayStartMs, (shiftsQ.data ?? []) as DrawerShift[]);
    const gaps = uncoveredBands(minutes, required);
    // Bands where a requirement exists at all (for the soft outline).
    const reqBands: Array<{ left: number; width: number }> = [];
    let i = 0;
    const n = 24 * 60;
    while (i < n) {
      if (required[i] > 0) {
        const start = i;
        while (i < n && required[i] > 0) i++;
        reqBands.push({ left: (start / n) * 100, width: ((i - start) / n) * 100 });
      } else i++;
    }
    return { gaps, reqBands };
  }, [reqsQ.data, shiftsQ.data, dayStartMs, dow]);

  // ── Drag state ─────────────────────────────────────────────────────────
  const laneAreaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    origStartMs: number;
    origEndMs: number;
    laneWidth: number;
    moved: boolean;
  } | null>(null);
  const [dragOffsetPct, setDragOffsetPct] = useState<{ id: string; pct: number } | null>(null);
  const [savingMove, setSavingMove] = useState(false);

  function snapDelta(dxPx: number, laneWidth: number): number {
    const minutes = (dxPx / laneWidth) * 24 * 60;
    return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
  }

  function onBlockPointerDown(e: React.PointerEvent, s: DrawerShift, draggable: boolean) {
    if (!draggable) return;
    const lane = laneAreaRef.current;
    if (!lane) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      id: s.id,
      startClientX: e.clientX,
      origStartMs: new Date(s.starts_at).getTime(),
      origEndMs: new Date(s.ends_at).getTime(),
      laneWidth: lane.getBoundingClientRect().width,
      moved: false,
    };
  }

  function onBlockPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClientX;
    if (Math.abs(dx) > 4) d.moved = true;
    setDragOffsetPct({ id: d.id, pct: (dx / d.laneWidth) * 100 });
  }

  async function onBlockPointerUp(e: React.PointerEvent, s: DrawerShift) {
    const d = dragRef.current;
    dragRef.current = null;
    setDragOffsetPct(null);
    if (!d || d.id !== s.id) return;
    const dx = e.clientX - d.startClientX;
    if (!d.moved || Math.abs(dx) <= 4) {
      onShiftClick?.(s.id);
      return;
    }
    const deltaMin = snapDelta(dx, d.laneWidth);
    if (deltaMin === 0) return;
    const dur = d.origEndMs - d.origStartMs;
    let newStart = d.origStartMs + deltaMin * 60000;
    // Clamp inside the visible day.
    newStart = Math.max(dayStartMs, Math.min(newStart, dayStartMs + 24 * 3600 * 1000 - dur));
    const newEnd = newStart + dur;
    setSavingMove(true);
    try {
      await updateCall({
        data: {
          id: s.id,
          patch: {
            starts_at: new Date(newStart).toISOString(),
            ends_at: new Date(newEnd).toISOString(),
          },
        },
      });
      toast.success(`Moved to ${fmtT(new Date(newStart).toISOString())}`);
      shiftsQ.refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    } finally {
      setSavingMove(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[88vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {day ? day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "Day timeline"}
          </SheetTitle>
          <SheetDescription>
            {locationName ?? "All locations"} · {shiftsQ.data?.length ?? 0} shifts · drag a block to move it (15-min snap), tap to edit
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 mb-2 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setPickedLocId(null)}
              className={cn(
                "min-h-[36px] rounded-md border px-2 text-xs font-semibold transition-colors",
                effectiveLocId === null ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
              )}
            >
              All
            </button>
            {(locsQ.data ?? []).filter((l) => l.active !== false).map((l) => (
              <button
                key={l.id}
                onClick={() => setPickedLocId(l.id)}
                className={cn(
                  "min-h-[36px] rounded-md border px-2 text-xs font-semibold transition-colors",
                  effectiveLocId === l.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                )}
              >
                {l.name}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {day && (
            <Button size="sm" onClick={() => onCreateClick?.(day)}>
              + Add shift{locationName ? ` · ${locationName}` : ""}
            </Button>
          )}
        </div>

        {/* Horizontally scrollable timeline (mobile-safe at 375px) */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <div style={{ minWidth: LANE_MIN_WIDTH }}>
            {/* Hour axis */}
            <div className="flex border-b border-border bg-muted/40 text-[10px] font-medium text-muted-foreground tabular-nums">
              <div className="w-28 shrink-0 border-r border-border px-2 py-1 sticky left-0 bg-muted/40 z-10">Staff</div>
              <div className="relative h-6 flex-1">
                {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => (
                  <span key={h} className="absolute top-1" style={{ left: `${(h / 24) * 100}%` }}>
                    {h === 24 ? "" : `${String(h).padStart(2, "0")}:00`}
                  </span>
                ))}
              </div>
            </div>

            {/* Required-coverage band */}
            {coverage && (
              <div className="flex border-b border-border">
                <div className="w-28 shrink-0 border-r border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground sticky left-0 bg-background z-10">
                  Required
                </div>
                <div className="relative h-5 flex-1 bg-muted/20">
                  {coverage.reqBands.map((b, i) => (
                    <div
                      key={`req-${i}`}
                      className="absolute top-0 h-full border-y border-primary/30 bg-primary/10"
                      style={{ left: `${b.left}%`, width: `${b.width}%` }}
                      title="Coverage required"
                    />
                  ))}
                  {coverage.gaps.map((g, i) => (
                    <div
                      key={`gap-${i}`}
                      className="absolute top-0 h-full bg-destructive/40"
                      style={{
                        left: `${g.left}%`,
                        width: `${g.width}%`,
                        backgroundImage:
                          "repeating-linear-gradient(45deg, rgba(220,38,38,0.5) 0 4px, transparent 4px 8px)",
                      }}
                      title="Uncovered against requirement"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Staff swimlanes */}
            <div ref={laneAreaRef}>
              {lanes.length === 0 ? (
                <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
                  {shiftsQ.isLoading ? "Loading…" : "No shifts on this day"}
                </div>
              ) : lanes.map((lane) => {
                const laneShifts = (shiftsQ.data ?? []).filter((s) => s.staff_id === lane.id);
                return (
                  <div key={lane.id ?? "__open__"} className="flex border-b border-border/70 last:border-b-0">
                    <div className="w-28 shrink-0 border-r border-border px-2 py-2 text-xs font-semibold sticky left-0 bg-background z-10 truncate">
                      {lane.label}
                    </div>
                    <div className="relative h-12 flex-1">
                      {/* 3-hour gridlines */}
                      {Array.from({ length: 7 }, (_, i) => (i + 1) * 3).map((h) => (
                        <div key={h} className="absolute inset-y-0 border-l border-border/40" style={{ left: `${(h / 24) * 100}%` }} />
                      ))}
                      {laneShifts.map((s) => {
                        const s0 = Math.max(new Date(s.starts_at).getTime(), dayStartMs);
                        const s1 = Math.min(new Date(s.ends_at).getTime(), dayStartMs + 24 * 3600 * 1000);
                        if (s1 <= s0) return null;
                        const left = ((s0 - dayStartMs) / (24 * 3600 * 1000)) * 100;
                        const width = Math.max(1.5, ((s1 - s0) / (24 * 3600 * 1000)) * 100);
                        const code = (s.service_code ?? s.job_code ?? "—").toString().toUpperCase();
                        const cls = classesForCode(code);
                        const isSegment = !!s.parent_shift_id;
                        const isOpen = !s.staff_id;
                        const draggable = !isOpen && !isSegment && !savingMove;
                        const dragging = dragOffsetPct?.id === s.id;
                        const canAddSegment = !isOpen && !isSegment && !isDailyCode(code) && !!s.client_id;
                        return (
                          <div
                            key={s.id}
                            onPointerDown={(e) => onBlockPointerDown(e, s, draggable)}
                            onPointerMove={onBlockPointerMove}
                            onPointerUp={(e) => onBlockPointerUp(e, s)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter") onShiftClick?.(s.id); }}
                            title={
                              isSegment
                                ? `${code} 1:1 segment · ${fmtT(s.starts_at)}–${fmtT(s.ends_at)} — segments move with their parent; tap to edit`
                                : `${code} · ${fmtT(s.starts_at)}–${fmtT(s.ends_at)} — drag to move, tap to edit`
                            }
                            className={cn(
                              "absolute rounded-md border-l-4 px-1.5 py-0.5 text-[10px] font-semibold select-none touch-none",
                              isSegment ? "top-6 h-5" : "top-1 h-7",
                              isOpen
                                ? "bg-destructive/10 border-destructive text-destructive"
                                : `${cls.bgSoft} ${cls.border} ${cls.text}`,
                              draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                              dragging && "z-20 shadow-md opacity-90",
                            )}
                            style={{
                              // left is relative to the lane, same basis as the
                              // drag offset — shift it directly while dragging.
                              left: `${left + (dragging ? dragOffsetPct!.pct : 0)}%`,
                              width: `${width}%`,
                            }}
                          >
                            <span className="block truncate leading-tight">
                              {code}{isSegment ? " · 1:1" : ""}{isOpen ? " · open" : ""}
                            </span>
                            <span className="block truncate text-[9px] font-medium opacity-75 leading-tight">
                              {fmtT(s.starts_at)}–{fmtT(s.ends_at)}
                            </span>
                            {canAddSegment && (
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
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
                                className="absolute -right-1 -top-1 rounded border border-border bg-background px-1 text-[9px] font-bold leading-tight hover:bg-muted"
                                title="Add 1:1 segment inside this shift"
                              >
                                +1:1
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Striped red = below the location's required staffing (1:1 segments pull their staff out of the count).
          Drag a block left/right to move it in 15-minute steps; tap it to open the editor.
        </p>
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
