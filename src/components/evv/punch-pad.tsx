import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Play, Square, MapPin, Lock, Loader2, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { EVV_SERVICE_CODES, evvServiceLabel, isEvvLockedCode, padMemberId } from "@/lib/evv-codes";
import { roundToQuarterHourISO } from "@/lib/time-rounding";
import { GeofenceMap } from "@/components/evv/geofence-map";
import { EvvConsentGate } from "@/components/evv/consent-gate";

type EntryType = "Client_Profile_Pass" | "General_Sidebar_Unscheduled";

type LockedClient = {
  id: string;
  name: string;
  memberId: string;
  facility?: string | null;
  authorizedCodes?: string[];
  homeLat?: number | null;
  homeLng?: number | null;
  geofenceRadiusFeet?: number | null;
  pcspGoals?: string[];
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

const TIMEZONES = [
  { v: "America/Denver", l: "Mountain (MST/MDT)" },
  { v: "America/Los_Angeles", l: "Pacific" },
  { v: "America/Phoenix", l: "Arizona (no DST)" },
  { v: "America/Chicago", l: "Central" },
  { v: "America/New_York", l: "Eastern" },
];

const EARTH_RADIUS_FEET = 20925525;

function haversineFeet(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dPhi = toRad(b.lat - a.lat);
  const dLam = toRad(b.lng - a.lng);
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const x =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLam / 2) ** 2;
  return 2 * EARTH_RADIUS_FEET * Math.asin(Math.min(1, Math.sqrt(x)));
}

// NOTE: Per Phase spec — DO NOT make a redundant getCurrentPosition() call on
// punch. Use the already-cached `currentCaregiverCoords` (livePos) from the
// live watchPosition feed that powers the blue dot on the map.

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
  entryType: EntryType;
  lockedClient?: LockedClient | null;
  caseload?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    medicaid_id: string | null;
    physical_address: string | null;
    job_code?: string[] | null;
    home_latitude?: number | null;
    home_longitude?: number | null;
    geofence_radius_feet?: number | null;
    pcsp_goals?: string[] | null;
  }>;
}

export function PunchPad({ entryType, lockedClient = null, caseload = [] }: PunchPadProps) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const [serviceCode, setServiceCode] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>(lockedClient?.id ?? "");
  const [selectedFacility, setSelectedFacility] = useState<string>(lockedClient?.facility ?? "");
  const [timezone, setTimezone] = useState<string>("America/Denver");
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [success, setSuccess] = useState<null | { duration: string }>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  // `currentCaregiverCoords` — single shared cache fed by watchPosition.
  // Same source as the blue dot on the Leaflet map; reused at punch time
  // to avoid a redundant getCurrentPosition call that races permissions.
  const [livePos, setLivePos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [hardwareDenied, setHardwareDenied] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setHardwareDenied(true);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setHardwareDenied(false);
        setLivePos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setHardwareDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Geofence variance overlay state
  const [variance, setVariance] = useState<null | {
    distanceFeet: number;
    limitFeet: number;
    pos: { lat: number; lng: number; acc: number };
  }>(null);
  const [varianceReason, setVarianceReason] = useState("");

  // Clock-out compliance modal state
  const [showCompliance, setShowCompliance] = useState(false);
  const [checkedGoals, setCheckedGoals] = useState<Record<string, boolean>>({});
  const [baselineChecked, setBaselineChecked] = useState(false);
  const [narrative, setNarrative] = useState("");
  const [showNarrativeError, setShowNarrativeError] = useState(false);

  const facilities = useMemo(() => {
    const set = new Set<string>();
    caseload.forEach((c) => {
      const a = (c.physical_address ?? "").trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [caseload]);

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
  const activeMatchesThisPad = active && (!lockedClient || active.client_id === lockedClient.id);

  useEffect(() => {
    if (!activeMatchesThisPad) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeMatchesThisPad, active?.id]);

  const clientForPunch: LockedClient | null = lockedClient
    ? lockedClient
    : (() => {
        const c = caseload.find((x) => x.id === selectedClientId);
        if (!c) return null;
        return {
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          memberId: padMemberId(c.medicaid_id),
          facility: c.physical_address,
          authorizedCodes: c.job_code ?? undefined,
          homeLat: c.home_latitude ?? null,
          homeLng: c.home_longitude ?? null,
          geofenceRadiusFeet: c.geofence_radius_feet ?? null,
          pcspGoals: c.pcsp_goals ?? undefined,
        };
      })();

  // Restrict service codes to those authorized on the client profile.
  const codesForClient = useMemo(() => {
    const authorized = clientForPunch?.authorizedCodes;
    if (authorized && authorized.length) {
      // Mix: prefer client's job codes (DSPD billing codes) — fall back to EVV labels if matched.
      return authorized.map((code) => ({
        code,
        label: evvServiceLabel(code),
      }));
    }
    return EVV_SERVICE_CODES.map((c) => ({ code: c.code, label: c.label }));
  }, [clientForPunch?.authorizedCodes]);

  // Map / proximity derivation — shared by clock-in pad and clock-out modal.
  const mapHome =
    typeof clientForPunch?.homeLat === "number" &&
    typeof clientForPunch?.homeLng === "number" &&
    isFinite(clientForPunch.homeLat as number) &&
    isFinite(clientForPunch.homeLng as number)
      ? { lat: clientForPunch!.homeLat as number, lng: clientForPunch!.homeLng as number }
      : null;
  const mapRadiusFeet = clientForPunch?.geofenceRadiusFeet ?? 1000;
  const insideZone = mapHome && livePos
    ? haversineFeet(mapHome, livePos) <= mapRadiusFeet
    : true;

  const requireFacility = entryType === "General_Sidebar_Unscheduled";
  const inReady =
    !!serviceCode &&
    !!clientForPunch &&
    (!requireFacility || !!selectedFacility) &&
    !!org?.organization_id;

  async function writeShift(args: {
    pos: { lat: number; lng: number; acc: number };
    outsideReason?: string;
  }) {
    if (!user || !org || !clientForPunch) return;
    const nowIso = new Date().toISOString();
    const payload = {
      organization_id: org.organization_id,
      staff_id: user.id,
      client_id: clientForPunch.id,
      utah_medicaid_provider_id: providerIdFromOrg(org.organization_id),
      utah_medicaid_member_id: clientForPunch.memberId,
      service_type_code: serviceCode,
      gps_in_coordinates: { latitude: args.pos.lat, longitude: args.pos.lng, accuracy_meters: args.pos.acc },
      shift_entry_type: entryType,
      status: "Active",
      timezone_setting: timezone,
      outside_geofence_reason: args.outsideReason ?? null,
      raw_clock_in: nowIso,
      rounded_clock_in: roundToQuarterHourISO(nowIso),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("evv_timesheets").insert(payload as any);
    if (error) throw error;
    toast.success("Shift started — GPS captured.");
    await qc.invalidateQueries({ queryKey: ["evv-active", user.id] });
  }

  async function handleClockIn() {
    if (!user || !org || !clientForPunch) return;
    if (!clientForPunch.memberId) {
      toast.error("Client is missing a Utah Medicaid Member ID.");
      return;
    }
    setBusy(true);
    try {
      // Use the cached coordinates from the live map feed — no redundant
      // getCurrentPosition call that would race the permission state.
      if (hardwareDenied) { setDenied(true); return; }
      if (!livePos) {
        toast.error("Still acquiring GPS — please wait a moment and try again.");
        return;
      }
      const pos = livePos;

      const lat = clientForPunch.homeLat;
      const lng = clientForPunch.homeLng;
      const radius = clientForPunch.geofenceRadiusFeet ?? 1000;
      if (typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng)) {
        const dist = haversineFeet({ lat, lng }, { lat: pos.lat, lng: pos.lng });
        if (dist > radius) {
          setVariance({ distanceFeet: Math.round(dist), limitFeet: radius, pos });
          setVarianceReason("");
          return;
        }
      }

      await writeShift({ pos });
    } catch (e) {
      toast.error((e as Error).message || "Could not start shift.");
    } finally {
      setBusy(false);
    }
  }

  async function submitVariance() {
    if (!variance) return;
    const reason = varianceReason.trim();
    if (reason.length < 5) {
      toast.error("Please provide a variance justification.");
      return;
    }
    setBusy(true);
    try {
      await writeShift({ pos: variance.pos, outsideReason: reason });
      setVariance(null);
      setVarianceReason("");
    } catch (e) {
      toast.error((e as Error).message || "Could not start shift.");
    } finally {
      setBusy(false);
    }
  }

  // Goals for the currently-running shift's client
  const activeClientGoals = useMemo<string[]>(() => {
    if (!active) return [];
    if (lockedClient && active.client_id === lockedClient.id) {
      return lockedClient.pcspGoals ?? [];
    }
    const c = caseload.find((x) => x.id === active.client_id);
    return c?.pcsp_goals ?? [];
  }, [active, lockedClient, caseload]);

  const wordCount = useMemo(() => {
    const t = narrative.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }, [narrative]);

  const hasGoalSelected =
    baselineChecked || Object.values(checkedGoals).some(Boolean);
  const NARRATIVE_MIN_WORDS = 50;
  const narrativeOk = wordCount >= NARRATIVE_MIN_WORDS;
  const canSubmitCompliance = hasGoalSelected && narrativeOk && !busy;

  // Out-of-bounds variance for the clock-OUT punch (mirrors clock-in flow)
  const [outVariance, setOutVariance] = useState<null | {
    distanceFeet: number;
    limitFeet: number;
    pos: { lat: number; lng: number; acc: number };
  }>(null);
  const [outVarianceReason, setOutVarianceReason] = useState("");

  function openCompliance() {
    if (!active) return;
    setCheckedGoals({});
    setBaselineChecked(false);
    setNarrative("");
    setShowNarrativeError(false);
    setShowCompliance(true);
  }

  async function finalizeClockOut(args: {
    pos: { lat: number; lng: number; acc: number };
    outsideReason?: string;
  }) {
    if (!user || !active) return;
    const selectedGoals = Object.entries(checkedGoals)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (baselineChecked) selectedGoals.push("General baseline monitoring & safety oversight");

    const clockOut = new Date().toISOString();
    const update: Record<string, unknown> = {
      clock_out_timestamp: clockOut,
      gps_out_coordinates: { latitude: args.pos.lat, longitude: args.pos.lng, accuracy_meters: args.pos.acc },
      status: "Pending",
      timezone_setting: "America/Denver",
      shift_note_text: narrative.trim(),
      goals_completed: selectedGoals,
      raw_clock_out: clockOut,
      rounded_clock_out: roundToQuarterHourISO(clockOut),
    };
    if (args.outsideReason) update.outside_geofence_reason = args.outsideReason;

    const { error } = await supabase
      .from("evv_timesheets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq("id", active.id);
    if (error) throw error;

    const duration = fmtElapsed(new Date(clockOut).getTime() - new Date(active.clock_in_timestamp).getTime());
    setShowCompliance(false);
    setOutVariance(null);
    setOutVarianceReason("");
    setSuccess({ duration });
    toast.success("✓ Shift successfully recorded. Timesheet submitted to the Compliance Desk for executive approval.");
    await qc.invalidateQueries({ queryKey: ["evv-active", user.id] });
  }

  async function submitCompliance() {
    if (!user || !active) return;
    if (!hasGoalSelected) {
      toast.error("Select at least one PCSP goal or baseline monitoring.");
      return;
    }
    if (!narrativeOk) {
      setShowNarrativeError(true);
      return;
    }
    setBusy(true);
    try {
      // Same single-source cache as clock-in — never call getCurrentPosition again.
      if (hardwareDenied) { setDenied(true); return; }
      if (!livePos) {
        toast.error("Still acquiring GPS — please wait a moment and try again.");
        return;
      }
      const pos = livePos;

      // Symmetric geofence check on clock-OUT
      const refClient = lockedClient ?? (() => {
        const c = caseload.find((x) => x.id === active.client_id);
        if (!c) return null;
        return {
          homeLat: c.home_latitude ?? null,
          homeLng: c.home_longitude ?? null,
          geofenceRadiusFeet: c.geofence_radius_feet ?? null,
        } as Pick<LockedClient, "homeLat" | "homeLng" | "geofenceRadiusFeet">;
      })();
      const lat = refClient?.homeLat;
      const lng = refClient?.homeLng;
      const radius = refClient?.geofenceRadiusFeet ?? 1000;
      if (typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng)) {
        const dist = haversineFeet({ lat, lng }, { lat: pos.lat, lng: pos.lng });
        if (dist > radius) {
          setOutVariance({ distanceFeet: Math.round(dist), limitFeet: radius, pos });
          setOutVarianceReason("");
          return; // BLOCK update until justification
        }
      }

      await finalizeClockOut({ pos });
    } catch (e) {
      toast.error((e as Error).message || "Could not end shift.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOutVariance() {
    if (!outVariance) return;
    const reason = outVarianceReason.trim();
    if (reason.length < 5) {
      toast.error("Please provide a variance justification.");
      return;
    }
    setBusy(true);
    try {
      await finalizeClockOut({ pos: outVariance.pos, outsideReason: reason });
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
    <EvvConsentGate>
    <section
      aria-label="EVV Shift Punch Pad"
      className="relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card to-primary/5 p-4 shadow-[var(--shadow-card)] sm:p-5"
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

      {lockedClient ? (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" /> Serving: {lockedClient.name}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Verified Medicaid ID: <span className="font-mono">{lockedClient.memberId || "—"}</span>
            {typeof lockedClient.geofenceRadiusFeet === "number" && (
              <> · Geofence: <span className="font-mono">{lockedClient.geofenceRadiusFeet} ft</span></>
            )}
          </p>
        </div>
      ) : null}

      {/* Responsive 2-col layout: map (left/top) + controls (right/bottom) */}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        {/* MAP COLUMN */}
        <div className="space-y-2">
          {hardwareDenied ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <p className="mb-1 font-semibold">⚠️ Hardware Permission Required</p>
              <p>
                You approved EVV consent on your profile, but your browser or
                device settings are currently blocking location access. Please
                open your device&apos;s system settings, authorize location
                tracking for this web browser application, and refresh the
                screen to unlock shift punches.
              </p>
            </div>
          ) : !isRunning && mapHome ? (
            <>
              <GeofenceMap
                homeLat={mapHome.lat}
                homeLng={mapHome.lng}
                radiusFeet={mapRadiusFeet}
                caregiver={livePos}
                insideZone={insideZone}
                height={260}
              />
              <p className="text-[11px] text-muted-foreground">
                {livePos
                  ? insideZone
                    ? `🟢 You are within the ${mapRadiusFeet} ft compliance zone.`
                    : `🔴 Outside the ${mapRadiusFeet} ft zone — a justification will be required.`
                  : "Awaiting browser location permission…"}
              </p>
            </>
          ) : !isRunning ? (
            <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
              No geofence configured for this client.
            </div>
          ) : null}
        </div>

        {/* CONTROLS COLUMN */}
        <div className="flex flex-col">




      <div className="grid gap-3">
        {entryType === "General_Sidebar_Unscheduled" && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium">🏢 Assign Facility / House Site</label>
              <Select value={selectedFacility} onValueChange={setSelectedFacility} disabled={isRunning}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select a facility" /></SelectTrigger>
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
              <Select value={selectedClientId} onValueChange={(v) => { setSelectedClientId(v); setServiceCode(""); }} disabled={isRunning}>
                <SelectTrigger className="h-12"><SelectValue placeholder="Select a client" /></SelectTrigger>
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
          <label className="mb-1 block text-xs font-medium">💼 Select Service Code</label>
          <Select value={serviceCode} onValueChange={setServiceCode} disabled={isRunning || !clientForPunch}>
            <SelectTrigger className="h-12"><SelectValue placeholder={clientForPunch ? "Select authorized code" : "Pick a client first"} /></SelectTrigger>
            <SelectContent>
              {codesForClient.length === 0 ? (
                <SelectItem value="__none" disabled>No codes authorized</SelectItem>
              ) : codesForClient.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clientForPunch?.authorizedCodes?.length ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Restricted to authorizations on {clientForPunch.name}'s profile.
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">🕐 Timezone</label>
          <Select value={timezone} onValueChange={setTimezone} disabled={isRunning}>
            <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center rounded-xl border border-border bg-background/70 py-3">
        <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
          {elapsed}
        </span>
      </div>

      {isRunning ? (
        <div className="mt-5">
          <button
            type="button"
            onClick={openCompliance}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-700 disabled:opacity-60"
            aria-label="End EVV Shift"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Square className="h-5 w-5 fill-current" />
                ⏹️ END EVV SHIFT
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={handleClockIn}
              disabled={busy || !inReady}
              className="group flex h-32 w-32 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition hover:scale-[1.02] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Start EVV Shift"
            >
              {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Play className="h-10 w-10 fill-current" />}
            </button>
          </div>
          <p className="mt-3 text-center text-sm font-semibold uppercase tracking-wider">
            ▶️ START EVV SHIFT
          </p>
        </>
      )}

      <p className="mt-3 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3" />
        Entry origin:&nbsp;
        <span className="font-mono">{entryType === "Client_Profile_Pass" ? "In-Chart" : "Sidebar Unscheduled"}</span>
      </p>
        </div>
      </div>


      {/* GPS-denied */}
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

      {/* Out-of-bounds variance */}
      <Dialog open={!!variance} onOpenChange={(o) => { if (!o) { setVariance(null); setVarianceReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📍 Out-of-Bounds EVV Notice
            </DialogTitle>
            <DialogDescription>
              You are currently located further away than the allowed limit set by your
              Administrator for this client. State compliance requires a variance
              justification.
            </DialogDescription>
          </DialogHeader>
          {variance && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              Measured distance: <span className="font-mono font-semibold">{variance.distanceFeet.toLocaleString()} ft</span>
              {" "}· Allowed: <span className="font-mono font-semibold">{variance.limitFeet.toLocaleString()} ft</span>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="variance-reason">Variance justification</Label>
            <Textarea
              id="variance-reason"
              rows={4}
              value={varianceReason}
              onChange={(e) => setVarianceReason(e.target.value)}
              placeholder="e.g. Community outing to the grocery store per PCSP goal."
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVariance(null); setVarianceReason(""); }}>Cancel</Button>
            <Button onClick={submitVariance} disabled={busy || varianceReason.trim().length < 5}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit & Clock In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Out-of-bounds variance — CLOCK-OUT (symmetric) */}
      <Dialog open={!!outVariance} onOpenChange={(o) => { if (!o) { setOutVariance(null); setOutVarianceReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📍 Out-of-Bounds EVV Exception Alert
            </DialogTitle>
            <DialogDescription>
              You are located outside the authorized radius limit set by your Administrator
              for this client. A variance text justification is required to log this clock-out.
            </DialogDescription>
          </DialogHeader>
          {outVariance && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              Measured distance: <span className="font-mono font-semibold">{outVariance.distanceFeet.toLocaleString()} ft</span>
              {" "}· Allowed: <span className="font-mono font-semibold">{outVariance.limitFeet.toLocaleString()} ft</span>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="out-variance-reason">Variance justification</Label>
            <Textarea
              id="out-variance-reason"
              rows={4}
              value={outVarianceReason}
              onChange={(e) => setOutVarianceReason(e.target.value)}
              placeholder="e.g. Completed community outing and clocked out at the destination."
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOutVariance(null); setOutVarianceReason(""); }}>Cancel</Button>
            <Button onClick={submitOutVariance} disabled={busy || outVarianceReason.trim().length < 5}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit & Clock Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success */}
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

      {/* Clock-Out Compliance Modal */}
      <Dialog
        open={showCompliance}
        onOpenChange={(o) => { if (!busy) setShowCompliance(o); }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-2xl overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>📋 Shift Verification &amp; Medicaid Compliance Form</DialogTitle>
            <DialogDescription>
              Complete the goals tracker and progress note below to submit your timesheet.
            </DialogDescription>
          </DialogHeader>

          {/* Live elapsed */}
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Live Duration
            </span>
            <span className="font-mono text-lg font-bold tabular-nums">{elapsed}</span>
          </div>

          {/* Proximity map — pulls up dynamically inside the clock-out modal */}
          {mapHome && (
            <div className="space-y-1">
              <GeofenceMap
                homeLat={mapHome.lat}
                homeLng={mapHome.lng}
                radiusFeet={mapRadiusFeet}
                caregiver={livePos}
                insideZone={insideZone}
                height={220}
              />
              <p className="text-[11px] text-muted-foreground">
                {livePos
                  ? insideZone
                    ? `🟢 Inside the ${mapRadiusFeet} ft zone — clean clock-out.`
                    : `🔴 Outside the ${mapRadiusFeet} ft zone — a variance reason will be required.`
                  : "Awaiting browser location permission…"}
              </p>
            </div>
          )}



          {/* PCSP goals */}
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">🎯 Person-Centered Support Plan (PCSP) Objectives Tracker</h3>
            <div className="grid gap-1.5 rounded-md border border-border p-3">
              {activeClientGoals.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No active PCSP goals on file for this individual.
                </p>
              )}
              {activeClientGoals.map((goal, idx) => {
                const id = `goal-${idx}`;
                return (
                  <label
                    key={id}
                    htmlFor={id}
                    className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                      checked={!!checkedGoals[goal]}
                      onChange={(e) =>
                        setCheckedGoals((p) => ({ ...p, [goal]: e.target.checked }))
                      }
                    />
                    <span>{goal}</span>
                  </label>
                );
              })}
              <div className="my-1 border-t border-dashed border-border" />
              <label
                htmlFor="goal-baseline"
                className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-accent"
              >
                <input
                  id="goal-baseline"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                  checked={baselineChecked}
                  onChange={(e) => setBaselineChecked(e.target.checked)}
                />
                <span className="italic text-muted-foreground">
                  General baseline monitoring &amp; safety oversight
                </span>
              </label>
            </div>
            {!hasGoalSelected && (
              <p className="text-[11px] text-muted-foreground">
                Select at least one goal worked on this shift.
              </p>
            )}
          </div>

          {/* Narrative */}
          <div className="grid gap-2">
            <Label htmlFor="evv-narrative">
              📝 Mandatory Progress Note &amp; Narrative Log
            </Label>
            <Textarea
              id="evv-narrative"
              rows={7}
              value={narrative}
              onChange={(e) => {
                setNarrative(e.target.value);
                if (showNarrativeError) setShowNarrativeError(false);
              }}
              placeholder="Describe client behaviors, choices, goal responses, and any incidents observed during this shift…"
              maxLength={5000}
            />
            <div
              className={`text-xs font-medium ${
                narrativeOk ? "text-emerald-600" : "text-muted-foreground"
              }`}
            >
              Word Count: {wordCount} / 50 words minimum
            </div>
            {showNarrativeError && !narrativeOk && (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                ⚠️ Compliance Failure: Your daily progress narrative must be at least
                50 words in length to satisfy state Medicaid auditing and DSPD billing
                validation criteria. Please provide additional detail regarding client
                behaviors, choices, and goal responses.
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <div
              className="w-full"
              onMouseEnter={() => { if (!narrativeOk) setShowNarrativeError(true); }}
              onClick={() => { if (!narrativeOk) setShowNarrativeError(true); }}
            >
              <Button
                type="button"
                onClick={submitCompliance}
                disabled={!canSubmitCompliance}
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                💾 Submit Final Timesheet to Compliance Desk
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
    </EvvConsentGate>
  );
}
