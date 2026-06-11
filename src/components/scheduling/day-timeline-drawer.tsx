import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { classesForCode, familyForCode } from "@/lib/scheduling/code-colors";
import { listShiftsInRange } from "@/lib/scheduling/shifts.functions";

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

  const dayStartMs = day ? new Date(day).setHours(0, 0, 0, 0) : 0;

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
              const open = !s.staff_id;
              const code = (s.service_code ?? s.job_code ?? "—").toString();
              return (
                <button
                  key={s.id}
                  onClick={() => onShiftClick?.(s.id)}
                  className={cn(
                    "absolute left-0 right-0 rounded-md border-l-4 px-2 py-1 text-left text-[11px] font-semibold transition-colors hover:brightness-95 min-h-[44px]",
                    open ? "bg-destructive/10 border-destructive text-destructive" : `${cls.bgSoft} ${cls.border} ${cls.text}`,
                  )}
                  style={{ top, height }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{code}</span>
                    <Badge variant="outline" className="text-[9px] capitalize">{familyForCode(code).replace("_", " ")}</Badge>
                  </div>
                  <div className="text-[10px] font-medium opacity-80">
                    {new Date(s.starts_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}–
                    {new Date(s.ends_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    {open && " · open"}
                  </div>
                </button>
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
    </Sheet>
  );
}
