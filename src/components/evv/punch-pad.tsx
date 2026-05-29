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
  Play, Square, MapPin, Lock, Loader2, AlertTriangle, CheckCircle2, Clock, Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { EVV_SERVICE_CODES, evvServiceLabel, isEvvLockedCode, padMemberId } from "@/lib/evv-codes";
import { roundToQuarterHourISO } from "@/lib/time-rounding";
import { EvvConsentGate } from "@/components/evv/consent-gate";
import { evaluateShiftNote, type CoachResult } from "@/lib/ai-coach.functions";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEZONES = [
  { v: "America/Denver",      l: "Mountain (MST/MDT)" },
  { v: "America/Los_Angeles", l: "Pacific" },
  { v: "America/Phoenix",     l: "Arizona (no DST)" },
  { v: "America/Chicago",     l: "Central" },
  { v: "America/New_York",    l: "Eastern" },
];

const EARTH_RADIUS_FEET = 20_925_525;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineFeet(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

function fmtElapsed(ms: number): string {
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

// ─── Props ────────────────────────────────────────────────────────────────────

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
  /** Pre-fill the service code dropdown (e.g. from scheduled shift). */
  presetServiceCode?: string;
  /** When true with presetServiceCode, the code dropdown is read-only. */
  lockServiceCode?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PunchPad({
  entryType,
  lockedClient = null,
  caseload = [],
  presetServiceCode,
  lockServiceCode = false,
}: PunchPadProps) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  // ── GPS state ───────────────────────────────────────────────────────────────
  // Single watchPosition — no redundant getCurrentPosition call.
  // Two-stage: high-accuracy watch, then low-accuracy fallback after 4 s.
  const [livePos, setLivePos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [hardwareDenied, setHardwareDenied] = useState(false);
  const [gpsAcquiring, setGpsAcquiring] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setHardwareDenied(true);
      setGpsAcquiring(false);
      return;
    }
    let watchHi: number | null = null;
    let watchLo: number | null = null;
    let gotFix = false;
    let cancelled = false;

    const onPos = (p: GeolocationPosition) => {
      if (cancelled) return;
      gotFix = true;
      setHardwareDenied(false);
      setGpsAcquiring(false);
      setLivePos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
    };
    const onErr = (err: GeolocationPositionError) => {
      if (cancelled) return;
      if (err.code === err.PERMISSION_DENIED) {
        setHardwareDenied(true);
        setGpsAcquiring(false);
      }
    };

    watchHi = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 8_000,
    });

    const fallbackTimer = window.setTimeout(() => {
      if (gotFix || cancelled) return;
      watchLo = navigator.geolocation.watchPosition(onPos, onErr, {
        enableHighAccuracy: false,
        maximumAge: 30_000,
        timeout: 8_000,
      });
    }, 4_000);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      if (watchHi !== null) navigator.geolocation.clearWatch(watchHi);
      if (watchLo !== null) navigator.geolocation.clearWatch(watchLo);
    };
  }, []);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [serviceCode, setServiceCode]           = useState(presetServiceCode ?? "");

  // Keep preset code in sync if the parent (route search) changes it.
  useEffect(() => {
    if (presetServiceCode) setServiceCode(presetServiceCode);
  }, [presetServiceCode]);
  const [selectedClientId, setSelectedClientId] = useState(lockedClient?.id ?? "");
  const [selectedFacility, setSelectedFacility] = useState(lockedClient?.facility ?? "");
  const [timezone, setTimezone]                 = useState("America/Denver");
  const [busy, setBusy]                         = useState(false);
  const [now, setNow]                           = useState(() => Date.now());

  // ── Clock-in variance state ─────────────────────────────────────────────────
  const [variance, setVariance] = useState<null | {
    distanceFeet?: number;
    limitFeet?: number;
    pos: { lat: number; lng: number; acc: number } | null;
    frameBlocked?: boolean;
  }>(null);
  const [varianceReason, setVarianceReason] = useState("");

  // ── Clock-out variance state ────────────────────────────────────────────────
  const [outVariance, setOutVariance] = useState<null | {
    distanceFeet: number;
    limitFeet: number;
    pos: { lat: number; lng: number; acc: number };
  }>(null);
  const [outVarianceReason, setOutVarianceReason] = useState("");

  // ── Clock-in success state ──────────────────────────────────────────────────
  const [clockInSuccess, setClockInSuccess] = useState<null | {
    evvClean: boolean;
    clientName: string;
  }>(null);

  // ── Clock-out success state ─────────────────────────────────────────────────
  const [success, setSuccess] = useState<null | {
    duration: string;
    evvClean: boolean;
  }>(null);

  // ── Clock-out compliance modal state ────────────────────────────────────────
  const [showCompliance, setShowCompliance]     = useState(false);
  const [checkedGoals, setCheckedGoals]         = useState<Record<string, boolean>>({});
  const [baselineChecked, setBaselineChecked]   = useState(false);
  const [narrative, setNarrative]               = useState("");
  const [showNarrativeError, setShowNarrativeError] = useState(false);

  // ── NECTAR Documentation Coach state ────────────────────────────────────────────
  const [aiBusy, setAiBusy]               = useState(false);
  const [aiCoach, setAiCoach]             = useState<CoachResult | null>(null);
  const [aiIterations, setAiIterations]   = useState(0);
  const [aiFlagCount, setAiFlagCount]     = useState(0);
  const [allowException, setAllowException] = useState(false);

  // ── Facilities list ─────────────────────────────────────────────────────────
  const facilities = useMemo(() => {
    const set = new Set<string>();
    caseload.forEach((c) => {
      const a = (c.physical_address ?? "").trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [caseload]);

  // ── Active shift query ──────────────────────────────────────────────────────
  const activeQuery = useQuery({
    enabled: !!user?.id,
    queryKey: ["evv-active", user?.id],
    queryFn: async (): Promise<ActiveShift | null> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(
          "id, client_id, clock_in_timestamp, service_type_code, " +
          "utah_medicaid_member_id, shift_entry_type, clients(first_name,last_name)",
        )
        .eq("staff_id", user!.id)
        .is("clock_out_timestamp", null)
        .order("clock_in_timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const c = (d.clients ?? null) as { first_name?: string; last_name?: string } | null;
      return {
        id: d.id,
        client_id: d.client_id,
        clock_in_timestamp: d.clock_in_timestamp,
        service_type_code: d.service_type_code,
        utah_medicaid_member_id: d.utah_medicaid_member_id,
        shift_entry_type: d.shift_entry_type as EntryType,
        client_name: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : undefined,
      };
    },
  });

  const active = activeQuery.data ?? null;
  const activeMatchesThisPad = active && (!lockedClient || active.client_id === lockedClient.id);

  // Live elapsed timer
  useEffect(() => {
    if (!activeMatchesThisPad) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeMatchesThisPad, active?.id]);

  // ── Client derivation ───────────────────────────────────────────────────────
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

  // ── Service codes ───────────────────────────────────────────────────────────
  const codesForClient = useMemo(() => {
    const authorized = clientForPunch?.authorizedCodes;
    if (authorized?.length) {
      return authorized.map((code) => ({ code, label: evvServiceLabel(code) }));
    }
    return EVV_SERVICE_CODES.map((c) => ({ code: c.code, label: c.label }));
  }, [clientForPunch?.authorizedCodes]);

  // ── Geofence derivation ─────────────────────────────────────────────────────
  const mapRadiusFeet = clientForPunch?.geofenceRadiusFeet ?? 1000;

  const homeCoords =
    typeof clientForPunch?.homeLat === "number" &&
    typeof clientForPunch?.homeLng === "number" &&
    isFinite(clientForPunch.homeLat) &&
    isFinite(clientForPunch.homeLng)
      ? { lat: clientForPunch.homeLat as number, lng: clientForPunch.homeLng as number }
      : null;

  const insideZone =
    homeCoords && livePos
      ? haversineFeet(homeCoords, livePos) <= mapRadiusFeet
      : true;

  // ── Readiness guard ─────────────────────────────────────────────────────────
  const requireFacility = entryType === "General_Sidebar_Unscheduled";
  const inReady =
    !!serviceCode &&
    !!clientForPunch &&
    (!requireFacility || !!selectedFacility) &&
    !!org?.organization_id;

  // ── GPS status label ────────────────────────────────────────────────────────
  const gpsStatusLabel = (() => {
    if (hardwareDenied)
      return { text: "⚠️ Location blocked — open device Settings to re-enable. You can still clock in with a written variance.", color: "amber" as const };
    if (gpsAcquiring || !livePos)
      return { text: "📡 Acquiring GPS signal — you can tap to clock in. A variance note will be offered if needed.", color: "neutral" as const };
    if (!serviceCode)
      return { text: "📍 GPS confirmed. Select a service code above.", color: "neutral" as const };
    if (!isEvvLockedCode(serviceCode))
      return { text: `🛈 ${serviceCode} — GPS logged passively, geofence not enforced for this code.`, color: "neutral" as const };
    if (insideZone)
      return { text: `🟢 GPS confirmed — you are within the ${mapRadiusFeet} ft compliance zone.`, color: "green" as const };
    return { text: `🔴 Outside the ${mapRadiusFeet} ft zone — a written variance will be required when you clock in.`, color: "red" as const };
  })();

  const gpsStripClass = {
    amber:   "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    neutral: "border-border bg-muted/40 text-muted-foreground",
    green:   "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    red:     "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  }[gpsStatusLabel.color];

  // ────────────────────────────────────────────────────────────────────────────
  // WRITE SHIFT (clock-in DB write)
  // ────────────────────────────────────────────────────────────────────────────

  async function writeShift(args: {
    pos: { lat: number; lng: number; acc: number } | null;
    outsideReason?: string;
  }) {
    if (!user || !org || !clientForPunch) return;
    const nowIso = new Date().toISOString();
    const isOutOfBounds = !!args.outsideReason;

    const payload = {
      organization_id:             org.organization_id,
      staff_id:                    user.id,
      client_id:                   clientForPunch.id,
      utah_medicaid_provider_id:   providerIdFromOrg(org.organization_id),
      utah_medicaid_member_id:     clientForPunch.memberId,
      service_type_code:           serviceCode,
      gps_in_coordinates: args.pos
        ? { latitude: args.pos.lat, longitude: args.pos.lng, accuracy_meters: args.pos.acc }
        : { latitude: null, longitude: null, accuracy_meters: null },
      shift_entry_type:                 entryType,
      status:                          "Active",
      timezone_setting:                timezone,
      outside_geofence_reason:         args.outsideReason ?? null,
      gps_validated:                   !isOutOfBounds,
      is_out_of_bounds:                isOutOfBounds,
      geofence_variance_justification: args.outsideReason ?? null,
      raw_clock_in:                    nowIso,
      rounded_clock_in:                roundToQuarterHourISO(nowIso),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("evv_timesheets").insert(payload as any);
    if (error) throw error;

    await qc.invalidateQueries({ queryKey: ["evv-active", user.id] });

    // Show the appropriate success confirmation dialog
    setClockInSuccess({
      evvClean: !isOutOfBounds,
      clientName: clientForPunch.name,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CLOCK-IN HANDLER
  // ────────────────────────────────────────────────────────────────────────────

  async function handleClockIn() {
    if (!user || !org || !clientForPunch) return;
    if (!clientForPunch.memberId) {
      toast.error("Client is missing a Utah Medicaid Member ID.");
      return;
    }
    setBusy(true);
    try {
      // No GPS fix yet or hardware denied → open variance modal so caregiver
      // is never hard-blocked. Modal opens only on tap, never on mount.
      if (hardwareDenied || !livePos) {
        setVariance({ frameBlocked: true, pos: null });
        setVarianceReason("");
        return;
      }

      const pos = livePos;

      // Hidden Gatekeeper: only EVV-locked codes enforce the geofence wall.
      if (
        isEvvLockedCode(serviceCode) &&
        homeCoords &&
        isFinite(homeCoords.lat) &&
        isFinite(homeCoords.lng)
      ) {
        const dist = haversineFeet(homeCoords, { lat: pos.lat, lng: pos.lng });
        if (dist > mapRadiusFeet) {
          setVariance({ distanceFeet: Math.round(dist), limitFeet: mapRadiusFeet, pos });
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
    if (reason.length < 10) {
      toast.error("Please type at least 10 characters of justification.");
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

  // ────────────────────────────────────────────────────────────────────────────
  // CLOCK-OUT FLOW
  // ────────────────────────────────────────────────────────────────────────────

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

  const hasGoalSelected    = baselineChecked || Object.values(checkedGoals).some(Boolean);
  const narrativeOk        = wordCount >= 50;
  const canSubmitCompliance = hasGoalSelected && narrativeOk && !busy;

  function openCompliance() {
    if (!active) return;
    setCheckedGoals({});
    setBaselineChecked(false);
    setNarrative("");
    setShowNarrativeError(false);
    setAiCoach(null);
    setAiIterations(0);
    setAiFlagCount(0);
    setAllowException(false);
    setShowCompliance(true);
  }

  async function finalizeClockOut(args: {
    pos: { lat: number; lng: number; acc: number };
    outsideReason?: string;
    aiStatus?: "Verified" | "Flagged" | "Exception";
    aiFeedback?: string;
    aiIterationCount?: number;
  }) {
    if (!user || !active) return;

    const selectedGoals = Object.entries(checkedGoals)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (baselineChecked) selectedGoals.push("General baseline monitoring & safety oversight");

    const clockOut = new Date().toISOString();
    const update: Record<string, unknown> = {
      clock_out_timestamp:  clockOut,
      gps_out_coordinates:  { latitude: args.pos.lat, longitude: args.pos.lng, accuracy_meters: args.pos.acc },
      status:               "Pending",
      timezone_setting:     "America/Denver",
      shift_note_text:      narrative.trim(),
      goals_completed:      selectedGoals,
      raw_clock_out:        clockOut,
      rounded_clock_out:    roundToQuarterHourISO(clockOut),
    };
    if (args.outsideReason) update.outside_geofence_reason = args.outsideReason;
    if (args.aiStatus) {
      update.ai_compliance_status    = args.aiStatus;
      update.ai_compliance_feedback  = args.aiFeedback ?? null;
      update.ai_coaching_iterations  = args.aiIterationCount ?? 0;
    }

    const { error } = await supabase
      .from("evv_timesheets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq("id", active.id);
    if (error) throw error;

    const duration = fmtElapsed(
      new Date(clockOut).getTime() - new Date(active.clock_in_timestamp).getTime(),
    );
    setShowCompliance(false);
    setOutVariance(null);
    setOutVarianceReason("");
    setSuccess({ duration, evvClean: !args.outsideReason });
    await qc.invalidateQueries({ queryKey: ["evv-active", user.id] });
  }

  async function submitCompliance(opts?: { exception?: boolean }) {
    if (!user || !active) return;
    if (!hasGoalSelected) {
      toast.error("Select at least one PCSP goal or baseline monitoring.");
      return;
    }
    if (!narrativeOk) {
      setShowNarrativeError(true);
      return;
    }

    const isException     = !!opts?.exception;
    let aiVerdict: CoachResult | null = aiCoach;
    let iterationsToPersist = aiIterations;

    if (!isException && (!aiVerdict || aiVerdict.status !== "Verified")) {
      setAiBusy(true);
      try {
        const selectedGoalsForAi = Object.entries(checkedGoals)
          .filter(([, v]) => v)
          .map(([k]) => k);
        if (baselineChecked) selectedGoalsForAi.push("General baseline monitoring & safety oversight");

        const clientFirst =
          lockedClient?.name?.split(" ")?.[0] ??
          caseload.find((c) => c.id === active.client_id)?.first_name ??
          "the client";

        const verdict = await evaluateShiftNote({
          data: {
            narrative: narrative.trim(),
            goals: selectedGoalsForAi,
            clientFirstName: clientFirst,
          },
        });
        aiVerdict = verdict;
        setAiCoach(verdict);
        const nextIter = aiIterations + 1;
        setAiIterations(nextIter);
        iterationsToPersist = nextIter;

        if (verdict.status === "Flagged") {
          const nextFlags = aiFlagCount + 1;
          setAiFlagCount(nextFlags);
          if (nextFlags >= 2) setAllowException(true);
          return;
        }
      } catch (e) {
        toast.error((e as Error).message || "NECTAR coach unavailable — please try again.");
        return;
      } finally {
        setAiBusy(false);
      }
    }

    const aiStatusForRow: "Verified" | "Exception" = isException ? "Exception" : "Verified";
    const aiFeedbackForRow = isException
      ? "🔴 Submitted with Exception Flag — NECTAR coaching not satisfied; pending admin review."
      : aiVerdict?.feedback ?? "Verified by NECTAR Documentation Coach.";

    setBusy(true);
    try {
      if (hardwareDenied) {
        toast.error("Location access blocked. Open device Settings, enable location for this browser, then try again.");
        return;
      }
      if (!livePos) {
        toast.error("Still acquiring GPS — please wait a moment and try again.");
        return;
      }
      const pos = livePos;

      // Symmetric geofence check on clock-out — EVV-locked codes only.
      const refClient = lockedClient ?? (() => {
        const c = caseload.find((x) => x.id === active.client_id);
        if (!c) return null;
        return {
          homeLat: c.home_latitude ?? null,
          homeLng: c.home_longitude ?? null,
          geofenceRadiusFeet: c.geofence_radius_feet ?? null,
        } as Pick<LockedClient, "homeLat" | "homeLng" | "geofenceRadiusFeet">;
      })();

      const lat    = refClient?.homeLat;
      const lng    = refClient?.homeLng;
      const radius = refClient?.geofenceRadiusFeet ?? 1000;

      if (
        isEvvLockedCode(active.service_type_code) &&
        typeof lat === "number" && typeof lng === "number" &&
        isFinite(lat) && isFinite(lng)
      ) {
        const dist = haversineFeet({ lat, lng }, { lat: pos.lat, lng: pos.lng });
        if (dist > radius) {
          setOutVariance({ distanceFeet: Math.round(dist), limitFeet: radius, pos });
          setOutVarianceReason("");
          return;
        }
      }

      await finalizeClockOut({
        pos,
        aiStatus: aiStatusForRow,
        aiFeedback: aiFeedbackForRow,
        aiIterationCount: iterationsToPersist,
      });
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

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  const elapsed   = activeMatchesThisPad
    ? fmtElapsed(now - new Date(active!.clock_in_timestamp).getTime())
    : "00:00:00";
  const isRunning = !!activeMatchesThisPad;

  return (
    <EvvConsentGate>
      <section
        aria-label="EVV Shift Punch Pad"
        className="relative overflow-hidden rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-card to-primary/5 p-4 shadow-[var(--shadow-card)] sm:p-5"
      >
        {/* ── Header ── */}
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
          <div className="flex items-center gap-2">
            {gpsAcquiring && !hardwareDenied && (
              <Badge variant="outline" className="gap-1 text-[10px] text-amber-600 border-amber-400">
                <Wifi className="h-3 w-3 animate-pulse" /> Acquiring GPS
              </Badge>
            )}
            {!gpsAcquiring && livePos && (
              <Badge variant="outline" className="gap-1 text-[10px] text-emerald-600 border-emerald-400">
                <MapPin className="h-3 w-3" /> GPS Live
              </Badge>
            )}
            {hardwareDenied && (
              <Badge variant="outline" className="gap-1 text-[10px] text-rose-600 border-rose-400">
                <AlertTriangle className="h-3 w-3" /> GPS Blocked
              </Badge>
            )}
            <Badge variant="outline" className="font-mono text-[10px]">
              EVV · Utah DHHS
            </Badge>
          </div>
        </header>

        {/* ── Locked client banner ── */}
        {lockedClient && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4" /> Serving: {lockedClient.name}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Verified Medicaid ID:{" "}
              <span className="font-mono">{lockedClient.memberId || "—"}</span>
              {typeof lockedClient.geofenceRadiusFeet === "number" && (
                <> · Geofence:{" "}
                  <span className="font-mono">{lockedClient.geofenceRadiusFeet} ft</span>
                </>
              )}
            </p>
          </div>
        )}

        {/* ── GPS status strip (clock-in only, no map) ── */}
        {!isRunning && (
          <div className={`mb-4 rounded-lg border p-3 text-xs leading-relaxed ${gpsStripClass}`}>
            {gpsAcquiring && !hardwareDenied ? (
              <p className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                {gpsStatusLabel.text}
              </p>
            ) : (
              <p>{gpsStatusLabel.text}</p>
            )}
          </div>
        )}

        {/* ── Controls ── */}
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
                <Select
                  value={selectedClientId}
                  onValueChange={(v) => { setSelectedClientId(v); setServiceCode(""); }}
                  disabled={isRunning}
                >
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
            <Select
              value={serviceCode}
              onValueChange={setServiceCode}
              disabled={isRunning || !clientForPunch}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder={clientForPunch ? "Select authorized code" : "Pick a client first"} />
              </SelectTrigger>
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
                Restricted to authorizations on {clientForPunch.name}&apos;s profile.
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

        {/* ── Elapsed timer ── */}
        <div className="mt-5 flex items-center justify-center rounded-xl border border-border bg-background/70 py-3">
          <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
            {elapsed}
          </span>
        </div>

        {/* ── Clock buttons ── */}
        {isRunning ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={openCompliance}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-700 disabled:opacity-60"
              aria-label="End EVV Shift"
            >
              {busy
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <><Square className="h-5 w-5 fill-current" /> ⏹️ END EVV SHIFT</>}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleClockIn}
                disabled={busy || !inReady}
                className="flex h-32 w-32 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition hover:scale-[1.02] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Start EVV Shift"
              >
                {busy
                  ? <Loader2 className="h-10 w-10 animate-spin" />
                  : <Play className="h-10 w-10 fill-current" />}
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
          <span className="font-mono">
            {entryType === "Client_Profile_Pass" ? "In-Chart" : "Sidebar Unscheduled"}
          </span>
        </p>

        {/* ════════════════════════════════════════════════════════════════════
            DIALOGS
        ════════════════════════════════════════════════════════════════════ */}

        {/* Clock-in variance — text only, no map */}
        <Dialog open={!!variance} onOpenChange={(o) => { if (!o) { setVariance(null); setVarianceReason(""); } }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                ⚠️ Geofence Variance Notice
              </DialogTitle>
              <DialogDescription>
                {variance?.frameBlocked
                  ? "Our system cannot verify your exact proximity to the approved client perimeter because mobile location access is restricted or unavailable. To proceed, state compliance requires a written location justification."
                  : "Our system detects you are starting your shift outside the approved client home perimeter. Please provide a brief justification (e.g., Community outing, medical transit, network latency)."}
              </DialogDescription>
            </DialogHeader>
            {variance && typeof variance.distanceFeet === "number" && typeof variance.limitFeet === "number" && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                Measured distance:{" "}
                <span className="font-mono font-semibold">{variance.distanceFeet.toLocaleString()} ft</span>
                {" "}· Allowed:{" "}
                <span className="font-mono font-semibold">{variance.limitFeet.toLocaleString()} ft</span>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="variance-reason">Location variance justification</Label>
              <Textarea
                id="variance-reason"
                rows={4}
                value={varianceReason}
                onChange={(e) => setVarianceReason(e.target.value)}
                placeholder="Describe your location or device situation (e.g., Device location permissions restricted, starting shift at community job site, bad cell reception)."
                maxLength={500}
              />
              <p className="text-[11px] text-muted-foreground">
                {varianceReason.trim().length}/10 characters minimum
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setVariance(null); setVarianceReason(""); }}>
                Cancel
              </Button>
              <Button onClick={submitVariance} disabled={busy || varianceReason.trim().length < 10}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Clock In &amp; Start Shift
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Clock-out variance — text only, no map */}
        <Dialog open={!!outVariance} onOpenChange={(o) => { if (!o) { setOutVariance(null); setOutVarianceReason(""); } }}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                📍 Out-of-Bounds EVV Exception Alert
              </DialogTitle>
              <DialogDescription>
                You are located outside the authorized radius for this client. A written
                justification is required to submit this clock-out.
              </DialogDescription>
            </DialogHeader>
            {outVariance && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                Measured distance:{" "}
                <span className="font-mono font-semibold">{outVariance.distanceFeet.toLocaleString()} ft</span>
                {" "}· Allowed:{" "}
                <span className="font-mono font-semibold">{outVariance.limitFeet.toLocaleString()} ft</span>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="out-variance-reason">Variance justification</Label>
              <Textarea
                id="out-variance-reason"
                rows={4}
                value={outVarianceReason}
                onChange={(e) => setOutVarianceReason(e.target.value)}
                placeholder="e.g., Completed community outing and clocked out at the destination."
                maxLength={500}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setOutVariance(null); setOutVarianceReason(""); }}>
                Cancel
              </Button>
              <Button onClick={submitOutVariance} disabled={busy || outVarianceReason.trim().length < 5}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit &amp; Clock Out
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Clock-IN success confirmation */}
        <Dialog open={!!clockInSuccess} onOpenChange={(o) => { if (!o) setClockInSuccess(null); }}>
          <DialogContent className="overflow-hidden p-0">
            <div className={`px-6 py-5 ${clockInSuccess?.evvClean ? "bg-emerald-50 dark:bg-emerald-950" : "bg-amber-50 dark:bg-amber-950"}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${clockInSuccess?.evvClean ? "bg-emerald-500" : "bg-amber-500"}`}>
                  {clockInSuccess?.evvClean
                    ? <CheckCircle2 className="h-7 w-7 text-white" />
                    : <AlertTriangle className="h-7 w-7 text-white" />}
                </div>
                <div>
                  <p className={`text-base font-bold ${clockInSuccess?.evvClean ? "text-emerald-800 dark:text-emerald-200" : "text-amber-800 dark:text-amber-200"}`}>
                    {clockInSuccess?.evvClean ? "✅ EVV Clock-In Confirmed" : "⚠️ Shift Started with Variance"}
                  </p>
                  <p className={`text-xs ${clockInSuccess?.evvClean ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {clockInSuccess?.evvClean
                      ? "GPS verified · Location confirmed · EVV transmitted"
                      : "Variance logged · Pending admin review · EVV transmitted"}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4 px-6 py-4">
              <p className="text-sm text-muted-foreground">
                {clockInSuccess?.evvClean
                  ? `Your shift serving ${clockInSuccess.clientName} has started. GPS coordinates have been captured and transmitted to the EVV system. Your timesheet is now active.`
                  : `Your shift serving ${clockInSuccess?.clientName} has started with a geofence variance on file. Your written justification has been recorded and an administrator will review the variance flag on this timesheet.`}
              </p>
              <div className="flex justify-end">
                <Button
                  onClick={() => setClockInSuccess(null)}
                  className={clockInSuccess?.evvClean
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white"}
                >
                  Got it — Start Shift
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Clock-OUT success confirmation */}
        <Dialog open={!!success} onOpenChange={(o) => !o && setSuccess(null)}>
          <DialogContent className="overflow-hidden p-0">
            <div className={`px-6 py-5 ${success?.evvClean ? "bg-emerald-50 dark:bg-emerald-950" : "bg-amber-50 dark:bg-amber-950"}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${success?.evvClean ? "bg-emerald-500" : "bg-amber-500"}`}>
                  {success?.evvClean
                    ? <CheckCircle2 className="h-7 w-7 text-white" />
                    : <AlertTriangle className="h-7 w-7 text-white" />}
                </div>
                <div>
                  <p className={`text-base font-bold ${success?.evvClean ? "text-emerald-800 dark:text-emerald-200" : "text-amber-800 dark:text-amber-200"}`}>
                    {success?.evvClean ? "✅ Shift Successfully Closed" : "⚠️ Shift Closed with Variance"}
                  </p>
                  <p className={`text-xs ${success?.evvClean ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {success?.evvClean
                      ? "GPS verified · Documentation complete · Submitted to EVV"
                      : "Variance logged · Pending admin review · Submitted to EVV"}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4 px-6 py-4">
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Duration</span>
                <span className="font-mono text-lg font-bold tabular-nums">{success?.duration}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {success?.evvClean
                  ? "Your timesheet has been submitted to EVV & Timesheet Control for administrative sign-off. No further action required."
                  : "Your timesheet has been submitted with a variance flag. An administrator will review the out-of-bounds justification before final approval."}
              </p>
              <div className="flex justify-end">
                <Button
                  onClick={() => setSuccess(null)}
                  className={success?.evvClean
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white"}
                >
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Clock-Out Compliance Modal */}
        <Dialog open={showCompliance} onOpenChange={(o) => { if (!busy) setShowCompliance(o); }}>
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
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Live Duration</span>
              <span className="font-mono text-lg font-bold tabular-nums">{elapsed}</span>
            </div>

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
                        onChange={(e) => setCheckedGoals((p) => ({ ...p, [goal]: e.target.checked }))}
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
                  if (aiCoach) setAiCoach(null);
                }}
                placeholder="Describe client behaviors, choices, goal responses, and any incidents observed during this shift…"
                maxLength={5000}
              />
              <div className={`text-xs font-medium ${narrativeOk ? "text-emerald-600" : "text-muted-foreground"}`}>
                Word Count: {wordCount} / 50 words minimum
              </div>
              {showNarrativeError && !narrativeOk && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  ⚠️ Compliance Failure: Your daily progress narrative must be at least 50 words
                  to satisfy state Medicaid auditing and DSPD billing validation criteria.
                </div>
              )}
            </div>

            {/* NECTAR Documentation Coach */}
            {(aiBusy || aiCoach) && (
              <div className={`rounded-lg border-2 px-4 py-3 ${
                aiCoach?.status === "Verified"
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-amber-500/40 bg-amber-500/10"
              }`}>
                <div className="mb-1 flex items-center gap-2 text-sm font-bold">
                  💡 NECTAR Documentation Coach
                  {aiBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                {aiCoach && (
                  <p className={`text-xs leading-relaxed ${
                    aiCoach.status === "Verified"
                      ? "text-emerald-800 dark:text-emerald-200"
                      : "text-amber-900 dark:text-amber-100"
                  }`}>
                    {aiCoach.status === "Verified" ? "🟢 NECTAR CLEARED — " : "⚠️ "}
                    {aiCoach.feedback}
                  </p>
                )}
                {aiCoach?.status === "Flagged" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Edit your narrative above based on the tip, then re-submit. Iteration {aiIterations}.
                  </p>
                )}
              </div>
            )}

            <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-col">
              <div
                className="w-full"
                onMouseEnter={() => { if (!narrativeOk) setShowNarrativeError(true); }}
                onClick={() => { if (!narrativeOk) setShowNarrativeError(true); }}
              >
                <Button
                  type="button"
                  onClick={() => submitCompliance()}
                  disabled={!canSubmitCompliance || aiBusy}
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  {(busy || aiBusy) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {aiBusy
                    ? "🧠 NECTAR Coach reviewing your note…"
                    : aiCoach?.status === "Flagged"
                    ? "🔁 Re-Check with NECTAR Coach"
                    : "💾 Submit Final Timesheet to EVV & Timesheet Control"}
                </Button>
              </div>
              {allowException && aiCoach?.status === "Flagged" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submitCompliance({ exception: true })}
                  disabled={busy || aiBusy}
                  className="w-full border-rose-500/50 text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                >
                  🚩 Submit with Exception Flag
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </section>
    </EvvConsentGate>
  );
}
