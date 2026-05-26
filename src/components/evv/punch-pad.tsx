import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Play, Square, MapPin, Lock, Loader2, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { EVV_SERVICE_CODES, padMemberId } from "@/lib/evv-codes";

type EntryType = "Client_Profile_Pass" | "General_Sidebar_Unscheduled";

type LockedClient = {
  id: string;
  name: string;
  memberId: string;
  facility?: string | null;
};

type ActiveShift = {
  id: string;
  client_id: string;
  clock_in_timestamp: string;
  service_type_code: string;
  utah_medicaid_member_id: string;
  shift_entry_type: EntryType;
  client_name?: string;
};

function getPosition(): Promise<{ lat: number; lng: number; acc: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function providerIdFromOrg(orgId: string | undefined): string {
  if (!orgId) return "0000000";
  const digits = orgId.replace(/\D/g, "");
  return (digits + "0000000").slice(0, 7);
}

export interface PunchPadProps {
  /** Entry-point flag baked into every row. */
  entryType: EntryType;
  /** When provided, the client field is locked (In-Chart Pass). */
  lockedClient?: LockedClient | null;
  /** When entry is unscheduled, caller passes the caseload + facility list. */
  caseload?: Array<{ id: string; first_name: string; last_name: string; medicaid_id: string | null; physical_address: string | null }>;
}

export function PunchPad({ entryType, lockedClient = null, caseload = [] }: PunchPadProps) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const [serviceCode, setServiceCode] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>(lockedClient?.id ?? "");
  const [selectedFacility, setSelectedFacility] = useState<string>(lockedClient?.facility ?? "");
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [success, setSuccess] = useState<null | { duration: string }>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Facility list from caseload distinct addresses.
  const facilities = useMemo(() => {
    const set = new Set<string>();
    caseload.forEach((c) => {
      const a = (c.physical_address ?? "").trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [caseload]);

  // ── Hydrate any existing OPEN shift for this user, so Clock Out always works ──
  const activeQuery = useQuery({
    enabled: !!user?.id,
    queryKey: ["evv-active", user?.id],
    queryFn: async (): Promise<ActiveShift | null> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, client_id, clock_in_timestamp, service_type_code, utah_medicaid_member_id, shift_entry_type, clients(first_name,last_name)")
        .eq("staff_id", user!.id)
        .is("clock_out_timestamp", null)
        .order("clock_in_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const c = (data as { clients?: { first_name?: string; last_name?: string } | null }).clients ?? null;
      return {
        id: data.id,
        client_id: data.client_id,
        clock_in_timestamp: data.clock_in_timestamp,
        service_type_code: data.service_type_code,
        utah_medicaid_member_id: data.utah_medicaid_member_id,
        shift_entry_type: data.shift_entry_type as EntryType,
        client_name: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : undefined,
      };
    },
  });

  const active = activeQuery.data ?? null;
  // Only show "active" in this widget if the locked-client matches (or no lock).
  const activeMatchesThisPad = active && (!lockedClient || active.client_id === lockedClient.id);

  // Single, cleanly-cleared stopwatch interval (no infinite-loop hazards).
  useEffect(() => {
    if (!activeMatchesThisPad) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeMatchesThisPad, active?.id]);

  // --- Validation: are we ready to clock IN? ---
  const clientForPunch = lockedClient
    ? lockedClient
    : (() => {
        const c = caseload.find((x) => x.id === selectedClientId);
        if (!c) return null;
        return {
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          memberId: padMemberId(c.medicaid_id),
          facility: c.physical_address,
        } as LockedClient;
      })();

  const requireFacility = entryType === "General_Sidebar_Unscheduled";
  const inReady =
    !!serviceCode &&
    !!clientForPunch &&
    (!requireFacility || !!selectedFacility) &&
    !!org?.organization_id;

  async function handleClockIn() {
    if (!user || !org || !clientForPunch) return;
    if (!clientForPunch.memberId) {
      toast.error("Client is missing a Utah Medicaid Member ID.");
      return;
    }
    setBusy(true);
    try {
      let pos;
      try { pos = await getPosition(); }
      catch { setDenied(true); return; }

      const payload = {
        organization_id: org.organization_id,
        staff_id: user.id,
        client_id: clientForPunch.id,
        utah_medicaid_provider_id: providerIdFromOrg(org.organization_id),
        utah_medicaid_member_id: clientForPunch.memberId,
        service_type_code: serviceCode,
        gps_in_coordinates: { latitude: pos.lat, longitude: pos.lng, accuracy_meters: pos.acc },
        shift_entry_type: entryType,
        status: "Active",
      };
      const { error } = await supabase.from("evv_timesheets").insert(payload);
      if (error) throw error;
      toast.success("Shift started — GPS captured.");
      await qc.invalidateQueries({ queryKey: ["evv-active", user.id] });
    } catch (e) {
      toast.error((e as Error).message || "Could not start shift.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    if (!user || !active) return;
    setBusy(true);
    try {
      let pos;
      try { pos = await getPosition(); }
      catch { setDenied(true); return; }

      const clockOut = new Date().toISOString();
      const { error } = await supabase
        .from("evv_timesheets")
        .update({
          clock_out_timestamp: clockOut,
          gps_out_coordinates: { latitude: pos.lat, longitude: pos.lng, accuracy_meters: pos.acc },
          status: "Pending",
        })
        .eq("id", active.id);
      if (error) throw error;
      const duration = fmtElapsed(new Date(clockOut).getTime() - new Date(active.clock_in_timestamp).getTime());
      setSuccess({ duration });
      await qc.invalidateQueries({ queryKey: ["evv-active", user.id] });
    } catch (e) {
      toast.error((e as Error).message || "Could not end shift.");
    } finally {
      setBusy(false);
    }
  }

  const elapsed = activeMatchesThisPad
    ? fmtElapsed(now - new Date(active!.clock_in_timestamp).getTime())
    : "00:00:00";

  const isRunning = !!activeMatchesThisPad;

  return (
    <section
      aria-label="EVV Shift Punch Pad"
      className="relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card to-primary/5 p-5 shadow-[var(--shadow-card)]"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-2.5 w-2.5 animate-pulse rounded-full ${isRunning ? "bg-emerald-500" : "bg-rose-500"}`}
            aria-hidden
          />
          <span className="text-sm font-semibold uppercase tracking-wider">
            {isRunning ? "🟢 On the Shift" : "🔴 Out of Clock"}
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          EVV · Utah DHHS
        </Badge>
      </header>

      {/* Locked client display (In-Chart pass) */}
      {lockedClient ? (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" /> Serving: {lockedClient.name}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Verified Medicaid ID: <span className="font-mono">{lockedClient.memberId || "—"}</span>
          </p>
        </div>
      ) : null}

      {/* Selectors */}
      <div className="grid gap-3">
        {entryType === "General_Sidebar_Unscheduled" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium">🏢 Assign Facility / House Site</label>
              <Select value={selectedFacility} onValueChange={setSelectedFacility} disabled={isRunning}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select a facility" /></SelectTrigger>
                <SelectContent>
                  {facilities.length === 0 && (
                    <SelectItem value="__none" disabled>No facilities on file</SelectItem>
                  )}
                  {facilities.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">👤 Assign Client Individual</label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId} disabled={isRunning}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {caseload
                    .filter((c) => !selectedFacility || c.physical_address === selectedFacility)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                        {c.medicaid_id ? ` · #${padMemberId(c.medicaid_id)}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {clientForPunch && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Member ID: <span className="font-mono">{clientForPunch.memberId || "missing"}</span>
                </p>
              )}
            </div>
          </>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium">💼 Assign Medicaid Billing Code</label>
          <Select value={serviceCode} onValueChange={setServiceCode} disabled={isRunning}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Select service code" /></SelectTrigger>
            <SelectContent>
              {EVV_SERVICE_CODES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Live timer */}
      <div className="mt-5 flex items-center justify-center rounded-xl border border-border bg-background/70 py-3">
        <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
          {elapsed}
        </span>
      </div>

      {/* Big circular action button */}
      <div className="mt-5 flex justify-center">
        {isRunning ? (
          <button
            type="button"
            onClick={handleClockOut}
            disabled={busy}
            className="group flex h-32 w-32 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/30 transition hover:scale-[1.02] hover:bg-rose-700 disabled:opacity-60"
            aria-label="End EVV Shift"
          >
            {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Square className="h-10 w-10 fill-current" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClockIn}
            disabled={busy || !inReady}
            className="group flex h-32 w-32 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition hover:scale-[1.02] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Start EVV Shift"
          >
            {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Play className="h-10 w-10 fill-current" />}
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-sm font-semibold uppercase tracking-wider">
        {isRunning ? "⏹️ END EVV SHIFT" : "▶️ START EVV SHIFT"}
      </p>

      {/* Origin / footer chip */}
      <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3" />
        Entry origin:&nbsp;
        <span className="font-mono">{entryType === "Client_Profile_Pass" ? "In-Chart" : "Sidebar Unscheduled"}</span>
      </p>

      {/* GPS-denied overlay */}
      <Dialog open={denied} onOpenChange={setDenied}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              EVV Compliance Failure
            </DialogTitle>
            <DialogDescription>
              Federal law mandates location capture to start your shift. Please enable
              GPS permissions in your browser and try again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setDenied(false)}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success overlay */}
      <Dialog open={!!success} onOpenChange={(o) => !o && setSuccess(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Shift Saved
            </DialogTitle>
            <DialogDescription>
              Submitted to the Compliance Desk for Administrative Sign-off.
              {success ? <> Total duration: <strong className="font-mono">{success.duration}</strong>.</> : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setSuccess(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
