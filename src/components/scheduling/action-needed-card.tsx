import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertOctagon, ArrowLeftRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getActionNeeded } from "@/lib/scheduling/workflow.functions";

interface Props {
  organizationId: string;
  weekStart: Date;
  staffNames?: Map<string, string>;
  clientNames?: Map<string, string>;
  onJumpToShift?: (id: string) => void;
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** Aggregates declined published shifts + pending swap requests + open shifts. */
export function ActionNeededCard({ organizationId, weekStart, staffNames, clientNames, onJumpToShift }: Props) {
  const call = useServerFn(getActionNeeded);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const q = useQuery({
    enabled: !!organizationId,
    queryKey: ["action-needed", organizationId, weekStart.toISOString()],
    queryFn: () => call({
      data: {
        organizationId,
        startIso: weekStart.toISOString(),
        endIso: weekEnd.toISOString(),
      },
    }),
  });

  const declines = q.data?.declines ?? [];
  const swaps = q.data?.swaps ?? [];
  const openShifts = q.data?.openShifts ?? [];
  const total = declines.length + swaps.length + openShifts.length;

  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          <AlertOctagon className="h-4 w-4" />
          Action needed
        </h2>
        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
          {total}
        </Badge>
      </header>

      {q.isLoading ? (
        <p className="py-3 text-xs text-muted-foreground">Loading…</p>
      ) : total === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">Nothing to review this week.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {declines.map((d) => (
            <li key={`d-${d.id}`}>
              <button
                type="button"
                onClick={() => onJumpToShift?.(d.id)}
                className="flex w-full items-start gap-2 rounded-lg border bg-background p-2 text-left hover:bg-muted"
              >
                <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">Declined</span> · {d.service_code ?? "—"} · {fmtWhen(d.starts_at)}
                  <span className="block text-[11px] text-muted-foreground">
                    {staffNames?.get(d.staff_id) ?? "Staff"} · {clientNames?.get(d.client_id) ?? "Client"}
                    {d.notes ? ` — ${d.notes.split("\n").slice(-1)[0]}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {swaps.map((s) => (
            <li key={`s-${s.id}`}>
              <button
                type="button"
                onClick={() => onJumpToShift?.(s.shift_id)}
                className="flex w-full items-start gap-2 rounded-lg border bg-background p-2 text-left hover:bg-muted"
              >
                <ArrowLeftRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">Swap request</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {staffNames?.get(s.from_staff_id) ?? "Staff"}
                    {s.to_staff_id ? ` → ${staffNames?.get(s.to_staff_id) ?? "any"}` : ""}
                    {s.note ? ` — ${s.note}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {openShifts.map((o) => (
            <li key={`o-${o.id}`}>
              <button
                type="button"
                onClick={() => onJumpToShift?.(o.id)}
                className="flex w-full items-start gap-2 rounded-lg border bg-background p-2 text-left hover:bg-muted"
              >
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">Open shift</span> · {o.service_code ?? "—"} · {fmtWhen(o.starts_at)}
                  <span className="block text-[11px] text-muted-foreground">
                    {clientNames?.get(o.client_id) ?? "Client"} — needs assignment
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
