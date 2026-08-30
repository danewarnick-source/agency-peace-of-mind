import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addCalendarMonths,
  daysInCalendarMonth,
  weekdaySunday0,
  ymdFromParts,
} from "@/lib/denver-date";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function HhsMonthGrid({
  year,
  month,
  onMonthChange,
  disableNext,
  title,
  subtitle,
  legend,
  childrenForDay,
}: {
  year: number;
  month: number;
  onMonthChange: (next: { year: number; month: number }) => void;
  disableNext?: boolean;
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  childrenForDay: (args: { day: number; ymd: string }) => ReactNode;
}) {
  const days = daysInCalendarMonth(year, month);
  const firstYmd = ymdFromParts(year, month, 1);
  const pad = weekdaySunday0(firstYmd);
  const label = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold">{title}</h3>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            aria-label="Previous month"
            onClick={() => onMonthChange(addCalendarMonths(year, month, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[7.5rem] text-center text-sm font-semibold">{label}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            aria-label="Next month"
            disabled={disableNext}
            onClick={() => onMonthChange(addCalendarMonths(year, month, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      {legend}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d, i) => (
          <div key={`${d}-${i}`} className="text-center text-[10px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: pad }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const ymd = ymdFromParts(year, month, day);
          return <div key={ymd}>{childrenForDay({ day, ymd })}</div>;
        })}
      </div>
    </div>
  );
}
