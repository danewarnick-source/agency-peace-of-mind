import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

type Med = { id: string; medication_name: string; dosage: string | null; scheduled_times: string[]; is_active: boolean };
type Log = {
  id: string; medication_id: string; scheduled_for: string; scheduled_time_label: string | null;
  administered_at: string | null; status: "administered" | "refused" | "omitted" | "missed";
  exception_reason: string | null; notes: string | null; staff_name: string | null; signature_attestation: string | null;
};

const STATUS_STYLES: Record<Log["status"], string> = {
  administered: "bg-emerald-500/90 text-white",
  refused: "bg-rose-600/90 text-white",
  omitted: "bg-rose-500/90 text-white",
  missed: "bg-amber-400 text-amber-950",
};

export function MarCalendar({ clientId }: { clientId: string }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const startOfMonth = new Date(year, month, 1).toISOString();
  const endOfMonth = new Date(year, month + 1, 1).toISOString();

  const { data: meds } = useQuery({
    queryKey: ["mar-meds", clientId],
    queryFn: async (): Promise<Med[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_medications" as any)
        .select("id, medication_name, dosage, scheduled_times, is_active")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data as unknown as Med[]) ?? [];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["mar-logs", clientId, year, month],
    queryFn: async (): Promise<Log[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("emar_logs" as any)
        .select("id, medication_id, scheduled_for, scheduled_time_label, administered_at, status, exception_reason, notes, staff_name, signature_attestation")
        .eq("client_id", clientId)
        .gte("scheduled_for", startOfMonth)
        .lt("scheduled_for", endOfMonth);
      if (error) throw error;
      return (data as unknown as Log[]) ?? [];
    },
  });

  const logsByCell = useMemo(() => {
    const map = new Map<string, Log>();
    (logs ?? []).forEach((l) => {
      const d = new Date(l.scheduled_for);
      const key = `${l.medication_id}|${d.getDate()}|${l.scheduled_time_label || ""}`;
      map.set(key, l);
    });
    return map;
  }, [logs]);

  const today = new Date();
  const isPast = (day: number) =>
    new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">📅 Electronic MAR Sheet</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[140px] text-center text-sm font-medium">{monthLabel}</span>
          <Button type="button" variant="ghost" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px]">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Administered</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-600" /> Refused/Omitted</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-400" /> Missed</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-border bg-background" /> Scheduled</span>
      </div>

      {!meds?.length ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No medications scheduled.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card border border-border p-1 text-left min-w-[180px]">Medication / Time</th>
                {days.map((d) => (
                  <th key={d} className="border border-border p-1 text-center w-7 font-medium">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meds.flatMap((m) =>
                (m.scheduled_times.length ? m.scheduled_times : ["—"]).map((time) => (
                  <tr key={`${m.id}-${time}`}>
                    <td className="sticky left-0 z-10 bg-card border border-border p-1.5 align-top">
                      <div className="font-medium">{m.medication_name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.dosage} {time !== "—" && <span className="font-mono">· {time}</span>}
                        {!m.is_active && <Badge variant="outline" className="ml-1 text-[9px]">D/C</Badge>}
                      </div>
                    </td>
                    {days.map((d) => {
                      const log = logsByCell.get(`${m.id}|${d}|${time}`);
                      const past = isPast(d);
                      const cellClass = log
                        ? STATUS_STYLES[log.status]
                        : past && m.is_active
                          ? "bg-amber-100 text-amber-900"
                          : "bg-background";
                      return (
                        <td key={d} className="border border-border p-0">
                          {log ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className={`h-7 w-7 ${cellClass} hover:opacity-80`}>
                                  {log.status === "administered" ? "✓" : log.status === "refused" ? "R" : log.status === "omitted" ? "O" : "M"}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 text-xs space-y-1">
                                <div className="font-semibold">{m.medication_name} · {time}</div>
                                <div>Status: <span className="font-medium uppercase">{log.status}</span></div>
                                {log.administered_at && <div>Administered: {new Date(log.administered_at).toLocaleString()}</div>}
                                <div>Scheduled: {new Date(log.scheduled_for).toLocaleString()}</div>
                                {log.staff_name && <div>Staff: {log.staff_name}</div>}
                                {log.exception_reason && <div>Reason: {log.exception_reason}</div>}
                                {log.notes && <div className="text-muted-foreground">Notes: {log.notes}</div>}
                                {log.signature_attestation && <div className="mt-1 italic text-muted-foreground">Signed: {log.signature_attestation.slice(0, 40)}…</div>}
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <div className={`h-7 w-7 ${cellClass}`} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
