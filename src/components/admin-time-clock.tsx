import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Radio, MapPin, AlertTriangle, Clock, User } from "lucide-react";
import { LiveMap } from "./live-map";

type ActiveShift = {
  id: string;
  user_id: string;
  client_id: string | null;
  clock_in_time: string;
  clock_in_lat: number | null;
  clock_in_long: number | null;
  outside_geofence: boolean;
  clock_in_bypass_reason: string | null;
  job_code: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
  clients: { first_name: string | null; last_name: string | null; home_latitude: number | null; home_longitude: number | null } | null;
};

function fmtElapsed(startIso: string, now: number) {
  const ms = Math.max(0, now - new Date(startIso).getTime());
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function AdminTimeClockView() {
  const { data: org } = useCurrentOrg();
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const { data: shifts, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["admin-active-shifts", org?.organization_id],
    refetchInterval: 15000,
    queryFn: async (): Promise<ActiveShift[]> => {
      const { data, error } = await supabase
        .from("shifts")
        .select(`
          id, user_id, client_id, clock_in_time, clock_in_lat, clock_in_long,
          outside_geofence, clock_in_bypass_reason, job_code,
          profiles:user_id ( full_name, email ),
          clients:client_id ( first_name, last_name, home_latitude, home_longitude )
        `)
        .eq("organization_id", org!.organization_id)
        .is("clock_out_time", null)
        .order("clock_in_time", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ActiveShift[];
    },
  });

  const selected = useMemo(
    () => shifts?.find((s) => s.id === selectedId) ?? shifts?.[0] ?? null,
    [shifts, selectedId]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Radio className="h-6 w-6 text-emerald-500 animate-pulse" /> Who's Working Now
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live feed of every active EVV shift across the organization. Updates every 15 seconds. Click a row to see the geofence map.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Live feed */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">Active shifts</h3>
            <span className="text-xs text-muted-foreground">
              {shifts?.length ?? 0} working now
            </span>
          </div>
          {isLoading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !shifts?.length ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
              <Clock className="h-8 w-8 text-muted-foreground/40" />
              <p>No one is clocked in right now.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {shifts.map((s) => {
                const staffName = s.profiles?.full_name || s.profiles?.email || "—";
                const clientName = s.clients ? `${s.clients.first_name ?? ""} ${s.clients.last_name ?? ""}`.trim() : "—";
                const isSelected = (selected?.id ?? null) === s.id;
                return (
                  <li
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`flex cursor-pointer items-center gap-4 px-5 py-3 transition-colors ${
                      isSelected ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{staffName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Serving {clientName}
                        {s.job_code ? <span className="ml-1 font-mono">· {s.job_code}</span> : null}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums">{fmtElapsed(s.clock_in_time, now)}</p>
                      {s.outside_geofence ? (
                        <Badge className="mt-1 gap-1 bg-orange-100 text-orange-900 hover:bg-orange-100 dark:bg-orange-500/15 dark:text-orange-200">
                          <AlertTriangle className="h-3 w-3" /> Outside (Bypass)
                        </Badge>
                      ) : (
                        <Badge className="mt-1 gap-1 bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200">
                          <MapPin className="h-3 w-3" /> On-Site
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Map detail panel */}
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">Geofence map</h3>
            <p className="text-xs text-muted-foreground">
              {selected
                ? `Blue circle = 0.25-mile geofence around client's home. Red pin = where staff pressed clock-in.`
                : "Select an active shift to see GPS verification."}
            </p>
          </div>
          {selected ? (
            <div className="p-4">
              <LiveMap
                home={
                  selected.clients?.home_latitude != null && selected.clients?.home_longitude != null
                    ? { lat: Number(selected.clients.home_latitude), lng: Number(selected.clients.home_longitude) }
                    : null
                }
                staff={
                  selected.clock_in_lat != null && selected.clock_in_long != null
                    ? { lat: Number(selected.clock_in_lat), lng: Number(selected.clock_in_long) }
                    : null
                }
                height={300}
              />
              {selected.outside_geofence && selected.clock_in_bypass_reason && (
                <div className="mt-3 rounded-lg border border-orange-400/40 bg-orange-50 p-3 text-xs text-orange-900 dark:bg-orange-500/10 dark:text-orange-200">
                  <p className="mb-1 font-medium">Bypass reason logged</p>
                  <p>{selected.clock_in_bypass_reason}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-sm text-muted-foreground">No active shift selected.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
