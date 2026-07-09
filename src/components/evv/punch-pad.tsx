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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Play, Square, MapPin, Lock, Loader2, AlertTriangle, CheckCircle2, Clock, Wifi,
  Hexagon, Mic, MicOff, Sparkles, Pencil, ShieldCheck, ExternalLink,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { EVV_SERVICE_CODES, evvServiceLabel, isEvvLockedCode, padMemberId } from "@/lib/evv-codes";
import { roundToQuarterHourISO } from "@/lib/time-rounding";
import { computeEntryUnits } from "@/lib/billing-units";
import { EvvConsentGate } from "@/components/evv/consent-gate";
import { evaluateShiftNote, type CoachResult } from "@/lib/ai-coach.functions";
import { draftShiftNote, draftVarianceJustification, answerProceduralQuestion, type ProceduralResult } from "@/lib/ai-coach.functions";
import { NectarInfusionLock } from "@/components/nectar/nectar-infusion-lock";
import { useNectarInfusion } from "@/hooks/use-nectar-infusion";
import {
  BehaviorObservationsBlock,
  emptyBehaviorAnswers,
  validateBehaviorAnswers,
  type BehaviorAnswers,
} from "@/components/evv/behavior-observations-block";
import { useShiftBehaviorSetting } from "@/hooks/use-shift-behavior-setting";
import { getPendingTrackingForms } from "@/lib/forms.functions";
import { PendingTrackingFormsDialog, type PendingForm } from "@/components/evv/pending-tracking-forms-dialog";
import { NoteTriggerPrompt } from "@/components/residential/note-trigger-prompt";
import { IncidentReportDialog } from "@/components/incidents/incident-report-dialog";
import { AlertTriangle as AlertTriangleIcon } from "lucide-react";
import { useClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { ShiftMedDueCheck } from "@/components/medications/shift-med-due-check";
import { useComplianceGate } from "@/hooks/use-compliance-gate";
import { usePermissions } from "@/hooks/use-permissions";
import { useServerFn } from "@tanstack/react-start";
import { checkBillingEntry, checkStaffPrerequisite, raiseComplianceFlag } from "@/lib/nectar-compliance.functions";




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

const MAX_GPS_ACCURACY_METERS = 100; // readings worse (larger) than this are too coarse to trust

import { haversineFeet as _sharedHaversineFeet } from "@/lib/geo";
import { selectedPill, unselectedPill } from "@/components/evv/toggle-styles";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineFeet(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return _sharedHaversineFeet(a, b);
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
  const livePosRef = useRef<{ lat: number; lng: number; acc: number } | null>(null);
  const [hardwareDenied, setHardwareDenied] = useState(false);
  const [gpsAcquiring, setGpsAcquiring] = useState(true);
  const [awaitingGps, setAwaitingGps] = useState(false);

  const gpsConfident = !!livePos && isFinite(livePos.acc) && livePos.acc <= MAX_GPS_ACCURACY_METERS;

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
      const next = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      livePosRef.current = next;
      setLivePos(next);
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
    distanceFeet?: number;
    limitFeet: number;
    pos: { lat: number; lng: number; acc: number };
  }>(null);
  const [outVarianceReason, setOutVarianceReason] = useState("");

  // ── Stage 5: per-shift tracking-form front-guard state ──────────────────────
  // Pending dialog data + which proceed callback to invoke after the user
  // either skips (clock-out) or clears them. The EVV calls live in those
  // callbacks; the guard only PAUSES the punch, never modifies it.
  const [pendingFormsDialog, setPendingFormsDialog] = useState<null | {
    mode: "clockout" | "clockin";
    pending: PendingForm[];
    // Continues the original EVV call path.
    proceed: () => void | Promise<void>;
    // Re-runs the check; if cleared, proceed automatically.
    recheck: () => Promise<void>;
  }>(null);


  // ── Clock-in success state ──────────────────────────────────────────────────
  const [clockInSuccess, setClockInSuccess] = useState<null | {
    evvClean: boolean;
    clientName: string;
  }>(null);

  // ── Clock-out success state ─────────────────────────────────────────────────
  const [success, setSuccess] = useState<null | {
    duration: string;
    evvClean: boolean;
    correctionSubmitted?: boolean;
  }>(null);

  // ── Clock-out compliance modal state ────────────────────────────────────────
  const [showCompliance, setShowCompliance]     = useState(false);
  const [checkedGoals, setCheckedGoals]         = useState<Record<string, boolean>>({});
  const [baselineChecked, setBaselineChecked]   = useState(false);
  const [narrative, setNarrative]               = useState("");
  const [showNarrativeError, setShowNarrativeError] = useState(false);
  const [longShiftAck, setLongShiftAck]         = useState(false);
  const [triggersResolved, setTriggersResolved] = useState(true);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [incidentTriggerOpen, setIncidentTriggerOpen] = useState(false);
  const [incidentReportIds, setIncidentReportIds] = useState<string[]>([]);

  // ── Review-by-exception (Timeclock pass) ────────────────────────────────────
  // Variance + attestation + incident + staff-requested time correction. None
  // of these mutate raw clock_in/out timestamps; corrections go to the
  // corrected_clock_in/out + edit_reason fields and the row is routed to
  // supervisor review (review_status='needs_review') instead of billing.
  // The supervisor screen is dashboard.compliance-desk → Needs Review; on
  // approval, billing-units.ts reads corrected_clock_in/out instead of the
  // raw punches. Staff can see status on /dashboard/my-time-corrections.
  const [incidentFlag, setIncidentFlag] = useState(false);
  const [attestAccurate, setAttestAccurate] = useState(false);
  const [scheduledMinutes, setScheduledMinutes] = useState<number | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionIn, setCorrectionIn] = useState<string>("");   // datetime-local
  const [correctionOut, setCorrectionOut] = useState<string>(""); // datetime-local
  const [correctionReason, setCorrectionReason] = useState("");

  // ── NECTAR Documentation Coach state ────────────────────────────────────────────
  const [aiBusy, setAiBusy]               = useState(false);
  const [aiCoach, setAiCoach]             = useState<CoachResult | null>(null);
  const [aiIterations, setAiIterations]   = useState(0);
  const [aiFlagCount, setAiFlagCount]     = useState(0);
  const [allowException, setAllowException] = useState(false);

  // ── NECTAR Progress-Note Assist (Infusion add-on) ──────────────────────────
  const { enabled: nectarInfusionEnabled } = useNectarInfusion();
  const [shorthand, setShorthand]             = useState("");
  const [nectarDraft, setNectarDraft]         = useState<string | null>(null);
  const [draftBusy, setDraftBusy]             = useState(false);
  const [draftConfirmed, setDraftConfirmed]   = useState(false);
  const [nectarUsed, setNectarUsed]           = useState(false);
  const [isRecording, setIsRecording]         = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // ── NECTAR Completeness Check (Infusion add-on) ────────────────────────────
  type CFlag = {
    key: string;
    type: string;
    severity: "soft" | "hard";
    message: string;
    fix?: { label: string; route?: string };
  };
  const [completenessRan, setCompletenessRan]   = useState(false);
  const [completenessBusy, setCompletenessBusy] = useState(false);
  const [completenessFlags, setCompletenessFlags] = useState<CFlag[]>([]);
  const [dismissals, setDismissals] = useState<Record<string, string>>({});
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);
  const [dismissReasonDraft, setDismissReasonDraft] = useState("");
  const navigate = useNavigate();

  // ── NECTAR Variance Rescue (Infusion add-on) ───────────────────────────────
  const [varShorthand, setVarShorthand]       = useState("");
  const [varDraftBusy, setVarDraftBusy]       = useState(false);
  const [outVarShorthand, setOutVarShorthand] = useState("");
  const [outVarDraftBusy, setOutVarDraftBusy] = useState(false);

  // ── Post-shift Behavior Observations ───────────────────────────────────────
  const { data: behaviorSetting } = useShiftBehaviorSetting();
  const behaviorEnabled = behaviorSetting?.enabled ?? true;
  const [behaviorAnswers, setBehaviorAnswers] = useState<BehaviorAnswers>(emptyBehaviorAnswers);

  // ── Pre-submit medication check (reads real emar_logs, no shadow store) ───
  const [medDosesResolved, setMedDosesResolved] = useState(true);



  // ── NECTAR Procedural Q&A (Infusion add-on) ────────────────────────────────
  const [askOpen, setAskOpen]         = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askBusy, setAskBusy]         = useState(false);
  const [askResult, setAskResult]     = useState<ProceduralResult | null>(null);


  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);


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

  // ── Approved locations (per-client allowlist for variance flagging) ─────────
  // EVV still records actual GPS for every clock-in; this only suppresses the
  // variance prompt when staff is at a pre-approved community site and notes
  // which approved location matched on the EVV record.
  type ApprovedLoc = {
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    geofence_radius_feet: number;
  };
  const approvedClientId = lockedClient?.id ?? selectedClientId ?? active?.client_id ?? null;
  const approvedLocsQuery = useQuery({
    enabled: !!approvedClientId,
    queryKey: ["client-approved-locations", approvedClientId],
    queryFn: async (): Promise<ApprovedLoc[]> => {
      const { data, error } = await supabase
        .from("client_approved_locations")
        .select("id, label, latitude, longitude, geofence_radius_feet")
        .eq("client_id", approvedClientId!);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        label: r.label as string,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        geofence_radius_feet: Number(r.geofence_radius_feet),
      }));
    },
  });
  const approvedLocs = approvedLocsQuery.data ?? [];

  function matchApprovedLocation(pos: { lat: number; lng: number }): ApprovedLoc | null {
    for (const loc of approvedLocs) {
      if (!isFinite(loc.latitude) || !isFinite(loc.longitude)) continue;
      const d = haversineFeet({ lat: loc.latitude, lng: loc.longitude }, pos);
      if (d <= loc.geofence_radius_feet) return loc;
    }
    return null;
  }

  // Live elapsed timer
  useEffect(() => {
    if (!activeMatchesThisPad) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeMatchesThisPad, active?.id]);

  // ── Authorized billing codes (single source of truth: client_billing_codes) ──
  // Used instead of the stale job_code array on the clients row.
  // EVV uses ALL authorized codes (no day-program filter here).
  const effectiveClientId = lockedClient?.id ?? selectedClientId ?? undefined;
  const clientBillingCodesQ = useClientBillingCodes(effectiveClientId || undefined);
  const billingAuthorizedCodes: string[] | undefined = clientBillingCodesQ.data
    ? clientBillingCodesQ.data.map((b) => b.service_code)
    : undefined;

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
          // Use billing codes from client_billing_codes; fall back to caseload
          // job_code only while the query is still loading (billingAuthorizedCodes
          // is undefined until the first response arrives).
          authorizedCodes: billingAuthorizedCodes ?? c.job_code ?? undefined,
          homeLat: c.home_latitude ?? null,
          homeLng: c.home_longitude ?? null,
          geofenceRadiusFeet: c.geofence_radius_feet ?? null,
          pcspGoals: c.pcsp_goals ?? undefined,
        };
      })();

  // ── Service codes ───────────────────────────────────────────────────────────
  const codesForClient = useMemo(() => {
    // For a lockedClient, use its own authorizedCodes if available; otherwise
    // fall back to billing codes fetched above.
    const authorized = lockedClient
      ? (lockedClient.authorizedCodes ?? billingAuthorizedCodes)
      : billingAuthorizedCodes;
    if (authorized?.length) {
      return authorized.map((code) => ({ code, label: evvServiceLabel(code) }));
    }
    // No authorized codes yet — if still loading, show nothing; once loaded
    // an empty array means the client truly has no authorized codes.
    if (clientBillingCodesQ.isLoading) {
      return EVV_SERVICE_CODES.map((c) => ({ code: c.code, label: c.label }));
    }
    return [];
  }, [lockedClient, billingAuthorizedCodes, clientBillingCodesQ.isLoading]);

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
    homeCoords && livePos && gpsConfident
      ? haversineFeet(homeCoords, livePos) <= mapRadiusFeet
      : homeCoords && livePos
        ? false
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
    if (livePos && !gpsConfident)
      return { text: `📡 GPS signal is too weak to confirm your location (±${Math.round(livePos.acc)} m). A written variance will be required when you clock in.`, color: "amber" as const };
    const matchedHere = livePos && gpsConfident ? matchApprovedLocation({ lat: livePos.lat, lng: livePos.lng }) : null;
    if (matchedHere)
      return { text: `🟢 GPS confirmed — inside approved location "${matchedHere.label}". No variance required.`, color: "green" as const };
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
  // Stage 5 — Per-shift tracking-form FRONT-GUARDS (read-only, fail-open).
  // These run BEFORE the EVV write calls (writeShift / finalizeClockOut).
  // They NEVER touch evv_timesheets, GPS, status, or timestamps.
  // ────────────────────────────────────────────────────────────────────────────
  async function fetchPendingTrackingForms(
    input:
      | { tier: "clockout"; shiftId: string; clientId: string; serviceCode: string }
      | { tier: "clockin" },
  ): Promise<PendingForm[]> {
    // ~1.5s timeout. ANY error/timeout → return [] so the caller proceeds.
    const PROMISE_TIMEOUT_MS = 1500;
    try {
      const result = await Promise.race<{ pending: PendingForm[] } | "TIMEOUT">([
        getPendingTrackingForms({ data: input }),
        new Promise<"TIMEOUT">((resolve) =>
          setTimeout(() => resolve("TIMEOUT"), PROMISE_TIMEOUT_MS),
        ),
      ]);
      if (result === "TIMEOUT") return [];
      return result?.pending ?? [];
    } catch {
      return [];
    }
  }

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
    const matched =
      args.pos && isFinite(args.pos.acc) && args.pos.acc <= MAX_GPS_ACCURACY_METERS
        ? matchApprovedLocation({ lat: args.pos.lat, lng: args.pos.lng })
        : null;

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
      // Enroll out-of-bounds punches into the EVV Reconciliation queue so an
      // admin/manager can document a review decision (accept/correct/flag).
      reconciliation_status:           isOutOfBounds ? "pending" : null,
      raw_clock_in:                    nowIso,
      rounded_clock_in:                roundToQuarterHourISO(nowIso),
      matched_approved_location_id:    matched?.id ?? null,
      matched_approved_location_label: matched?.label ?? null,
    };

    // ── Staff-prerequisite gate: block clock-in if the staff lacks a required
    // qualification for this service code. Restrict-vs-override policy:
    //   staff → detect + raise flag + halt (no evv_timesheets row written).
    //   admin/manager/super_admin → dialog offers Acknowledge & continue / Stop.
    // Engine unchanged; only a hook call + branch is added here.
    const codesUpper = [String(serviceCode).toUpperCase()].filter(Boolean);
    const orgId = org.organization_id;

    const runInsert = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("evv_timesheets").insert(payload as any);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["evv-active", user.id] });
      setClockInSuccess({
        evvClean: !isOutOfBounds,
        clientName: clientForPunch.name,
      });
      return { ok: true } as const;
    };

    if (orgId && codesUpper.length > 0) {
      if (canOverrideCompliance) {
        const gateResult = await evvClockInGate(
          {
            clientId: clientForPunch.id,
            staffId: user.id,
            serviceCodes: codesUpper,
            at: nowIso,
          },
          runInsert,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (gateResult && (gateResult as any).stopped) {
          toast.message(
            "Clock-in halted per your compliance decision. Flag logged for audit.",
          );
          return;
        }
        return;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detected = (await detectStaffPrereq({
          data: {
            organizationId: orgId,
            staffId: user.id,
            serviceCodes: codesUpper,
            clientId: clientForPunch.id,
            at: nowIso,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        })) as {
          flags: Array<{
            ruleId: string;
            requirementId: string;
            matchedCodes: string[];
            source: { title: string; verbatim: string; citation: string | null };
          }>;
        };
        if (detected?.flags?.length) {
          for (const c of detected.flags) {
            try {
              await raiseComplianceFlagFn({
                data: {
                  organizationId: orgId,
                  ruleId: c.ruleId,
                  requirementId: c.requirementId,
                  detectionType: "staff_prerequisite",
                  subjectContext: {
                    client_id: clientForPunch.id,
                    date: nowIso.slice(0, 10),
                    staff_id: user.id,
                    service_codes: codesUpper,
                    source: "evv_clock_in",
                    missing_qualifications: c.matchedCodes,
                    restricted_for_role: role ?? "unknown",
                  },
                  sourceSnapshot: c.source,
                },
              });
            } catch {
              // Non-fatal: continue raising remaining flags.
            }
          }
          toast.error(
            "Clock-in held for compliance review. A required qualification is missing — a supervisor must resolve the flag before you can clock in.",
          );
          return;
        }
      }
    }

    await runInsert();

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
        // Low-confidence fixes can't auto-pass the geofence or match approved locations.
        if (!gpsConfident) {
          setVariance({ distanceFeet: undefined, limitFeet: mapRadiusFeet, pos });
          setVarianceReason("");
          return;
        }
        // Approved locations skip the variance prompt — actual GPS still captured.
        const matched = matchApprovedLocation({ lat: pos.lat, lng: pos.lng });
        const dist = haversineFeet(homeCoords, { lat: pos.lat, lng: pos.lng });
        if (!matched && dist > mapRadiusFeet) {
          setVariance({ distanceFeet: Math.round(dist), limitFeet: mapRadiusFeet, pos });
          setVarianceReason("");
          return;
        }
      }

      // Stage 5 — required_before_next_clockin front-guard. READ-ONLY,
      // fail-open: on error/timeout the guard returns [] and we proceed.
      // This is BEFORE writeShift; writeShift's payload is untouched.
      const pendingIn = await fetchPendingTrackingForms({ tier: "clockin" });
      if (pendingIn.length) {
        setPendingFormsDialog({
          mode: "clockin",
          pending: pendingIn,
          proceed: async () => {
            setPendingFormsDialog(null);
            setBusy(true);
            try { await writeShift({ pos }); } finally { setBusy(false); }
          },
          recheck: async () => {
            const again = await fetchPendingTrackingForms({ tier: "clockin" });
            if (!again.length) {
              setPendingFormsDialog(null);
              setBusy(true);
              try { await writeShift({ pos }); } finally { setBusy(false); }
            } else {
              setPendingFormsDialog((p) => p ? { ...p, pending: again } : p);
            }
          },
        });
        return;
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
      // Stage 5 — same front-guard for variance clock-in path. Fail-open.
      const pendingIn = await fetchPendingTrackingForms({ tier: "clockin" });
      if (pendingIn.length) {
        const pos = variance.pos;
        const outside = reason;
        setPendingFormsDialog({
          mode: "clockin",
          pending: pendingIn,
          proceed: async () => {
            setPendingFormsDialog(null);
            setBusy(true);
            try {
              await writeShift({ pos, outsideReason: outside });
              setVariance(null);
              setVarianceReason("");
            } finally { setBusy(false); }
          },
          recheck: async () => {
            const again = await fetchPendingTrackingForms({ tier: "clockin" });
            if (!again.length) {
              setPendingFormsDialog(null);
              setBusy(true);
              try {
                await writeShift({ pos, outsideReason: outside });
                setVariance(null);
                setVarianceReason("");
              } finally { setBusy(false); }
            } else {
              setPendingFormsDialog((p) => p ? { ...p, pending: again } : p);
            }
          },
        });
        return;
      }

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
  const nectarConfirmOk    = !nectarUsed || draftConfirmed;
  const behaviorError      = behaviorEnabled ? validateBehaviorAnswers(behaviorAnswers) : null;
  const behaviorOk         = behaviorError === null;
  const liveDurationMs = active
    ? Math.max(0, now - new Date(active.clock_in_timestamp).getTime())
    : 0;
  const isLongShift = liveDurationMs > 16 * 60 * 60 * 1000;
  // Correction request: staff is explicitly saying the recorded times are
  // wrong. Parse datetime-local values, require at least one changed field,
  // require reason ≥ 10 chars, and validate ordering / sanity window.
  const correctionInIso = correctionIn ? new Date(correctionIn).toISOString() : null;
  const correctionOutIso = correctionOut ? new Date(correctionOut).toISOString() : null;
  const effectiveInIso = correctionInIso ?? active?.clock_in_timestamp ?? null;
  const effectiveOutMs = correctionOutIso ? new Date(correctionOutIso).getTime() : now;
  const effectiveInMs = effectiveInIso ? new Date(effectiveInIso).getTime() : NaN;
  const correctionOrderOk =
    Number.isFinite(effectiveInMs) && effectiveOutMs > effectiveInMs;
  const correctionWithinWindow =
    !!active &&
    Number.isFinite(effectiveInMs) &&
    effectiveOutMs - new Date(active.clock_in_timestamp).getTime() <= 36 * 60 * 60 * 1000 &&
    effectiveInMs >= new Date(active.clock_in_timestamp).getTime() - 24 * 60 * 60 * 1000;
  const correctionHasChange =
    (!!correctionInIso && correctionInIso !== active?.clock_in_timestamp) ||
    !!correctionOutIso;
  const correctionReasonOk = correctionReason.trim().length >= 10;
  const correctionValid =
    correctionOpen && correctionHasChange && correctionReasonOk && correctionOrderOk && correctionWithinWindow;
  // When staff opens a correction, the "these times are accurate" ack is
  // moot — the whole point is that they aren't.
  const longShiftOk = !isLongShift || longShiftAck || correctionOpen;
  const canSubmitCompliance =
    hasGoalSelected && narrativeOk && nectarConfirmOk && behaviorOk &&
    longShiftOk && triggersResolved && medDosesResolved && !busy &&
    (!correctionOpen || correctionValid);


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
    setShorthand("");
    setNectarDraft(null);
    setDraftBusy(false);
    setDraftConfirmed(false);
    setNectarUsed(false);
    setCompletenessRan(false);
    setCompletenessFlags([]);
    setDismissals({});
    setDismissingKey(null);
    setDismissReasonDraft("");
    setBehaviorAnswers(emptyBehaviorAnswers);
    setLongShiftAck(false);
    setTriggersResolved(true);
    setMedDosesResolved(true);
    setCorrectionOpen(false);
    setCorrectionIn("");
    setCorrectionOut("");
    setCorrectionReason("");
    stopRecording();
    setShowCompliance(true);
  }

  // Format an ISO/Date as the value expected by <input type="datetime-local">
  // in the browser's local timezone: YYYY-MM-DDTHH:MM.
  function toLocalDatetimeInput(v: string | number | Date): string {
    const d = new Date(v);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openCorrectionPanel(a: ActiveShift) {
    setCorrectionOpen(true);
    // Seed inputs so staff can nudge one field without retyping the whole
    // date/time. Unchanged fields are treated as "this one was fine" only
    // when they match the recorded value (see correctionHasChange).
    setCorrectionIn((prev) => prev || toLocalDatetimeInput(a.clock_in_timestamp));
    setCorrectionOut((prev) => prev || toLocalDatetimeInput(now));
    if (!correctionReason) setCorrectionReason("");
  }



  // Re-running the check is required after staff edit the note/goals
  useEffect(() => {
    if (completenessRan) {
      setCompletenessRan(false);
      setCompletenessFlags([]);
      setDismissals({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrative, checkedGoals, baselineChecked]);

  async function runCompletenessCheck(): Promise<CFlag[]> {
    if (!active) return [];
    setCompletenessBusy(true);
    const flags: CFlag[] = [];
    try {
      // Hard checks first (mirror existing field validation in the panel)
      if (!hasGoalSelected) {
        flags.push({
          key: "no-goal",
          type: "missing_goal",
          severity: "hard",
          message: "Select at least one PCSP goal or baseline monitoring above.",
          fix: { label: "Pick a goal" },
        });
      }
      if (!narrativeOk) {
        flags.push({
          key: "short-note",
          type: "narrative_too_short",
          severity: "hard",
          message: `Progress note is ${wordCount} words — Medicaid requires at least 50.`,
          fix: { label: "Expand note" },
        });
      }
      if (nectarUsed && !draftConfirmed) {
        flags.push({
          key: "nectar-unconfirmed",
          type: "ai_unconfirmed",
          severity: "hard",
          message: "Confirm the NECTAR-drafted note accurately reflects the shift.",
          fix: { label: "Review & confirm" },
        });
      }

      // Soft cross-checks (Infusion layer)
      const dollarMatches = narrative.match(/\$\s?\d+(?:\.\d{1,2})?/g) ?? [];

      const spendQ = await supabase
        .from("client_spending_log")
        .select("id, amount", { count: "exact", head: false })
        .eq("shift_id", active.id);
      const loggedSpend = spendQ.data ?? [];

      if (dollarMatches.length > 0 && loggedSpend.length === 0) {
        flags.push({
          key: "mentioned-spend",
          type: "spend_mentioned_not_logged",
          severity: "soft",
          message: `You mentioned ${dollarMatches.slice(0, 3).join(", ")} in the note — add to the client spending log?`,
          fix: {
            label: "Open spending log",
            route: `/dashboard/workspace/${active.client_id}`,
          },
        });
      }

      const reimbQ = await supabase
        .from("activity_reimbursement_requests")
        .select("id, status, receipt_paths, event_summary")
        .eq("shift_id", active.id)
        .eq("status", "approved");
      const approvedReimbs = reimbQ.data ?? [];
      const missingReceipt = approvedReimbs.find(
        (r) => !Array.isArray(r.receipt_paths) || r.receipt_paths.length === 0,
      );
      if (missingReceipt) {
        flags.push({
          key: `reimb-no-receipt-${missingReceipt.id}`,
          type: "reimbursement_receipt_missing",
          severity: "soft",
          message: "An approved activity reimbursement has no receipt uploaded yet.",
          fix: { label: "Upload receipt", route: "/dashboard/reimbursements" },
        });
      }
      const missingSummary = approvedReimbs.find((r) => !r.event_summary);
      if (missingSummary) {
        flags.push({
          key: `reimb-no-summary-${missingSummary.id}`,
          type: "reimbursement_summary_missing",
          severity: "soft",
          message: "Approved activity has no event summary — add one for billing.",
          fix: { label: "Add summary", route: "/dashboard/reimbursements" },
        });
      }

      setCompletenessFlags(flags);
      setCompletenessRan(true);
      return flags;
    } catch (e) {
      toast.error((e as Error).message || "Couldn't run completeness check.");
      return flags;
    } finally {
      setCompletenessBusy(false);
    }
  }

  function jumpToFix(flag: CFlag) {
    if (flag.fix?.route) {
      setShowCompliance(false);
      navigate({ to: flag.fix.route });
    } else {
      // In-form hard issues — just close any dismiss draft and scroll focus
      setDismissingKey(null);
      toast.info(flag.fix?.label ?? "Address this above, then re-check.");
    }
  }

  function confirmDismiss(key: string) {
    const reason = dismissReasonDraft.trim();
    if (reason.length < 5) {
      toast.error("Add a short reason (5+ chars) so the admin knows why.");
      return;
    }
    setDismissals((d) => ({ ...d, [key]: reason }));
    setDismissingKey(null);
    setDismissReasonDraft("");
  }


  function stopRecording() {
    try { recognitionRef.current?.stop?.(); } catch { /* ignore */ }
    recognitionRef.current = null;
    setIsRecording(false);
  }

  function startRecording() {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input isn't supported on this browser.");
      return;
    }
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        let finalText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        }
        if (finalText) {
          setShorthand((prev) => (prev ? prev.trim() + " " : "") + finalText.trim());
        }
      };
      rec.onerror = () => stopRecording();
      rec.onend = () => setIsRecording(false);
      recognitionRef.current = rec;
      rec.start();
      setIsRecording(true);
    } catch {
      toast.error("Couldn't start voice input — please type instead.");
    }
  }

  async function runDraftWithNectar() {
    if (!active) return;
    const text = shorthand.trim();
    if (text.length < 3) {
      toast.error("Add a few words of shorthand first (e.g. 'park, soda $2, talked to 2 ppl').");
      return;
    }
    stopRecording();
    setDraftBusy(true);
    try {
      const selectedGoalsForAi = Object.entries(checkedGoals)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (baselineChecked) selectedGoalsForAi.push("General baseline monitoring & safety oversight");

      const clientFirst =
        lockedClient?.name?.split(" ")?.[0] ??
        caseload.find((c) => c.id === active.client_id)?.first_name ??
        "the client";

      const res = await draftShiftNote({
        data: { shorthand: text, goals: selectedGoalsForAi, clientFirstName: clientFirst },
      });
      setNectarDraft(res.draft);
      setDraftConfirmed(false);
      setNectarUsed(true);
    } catch (e) {
      toast.error((e as Error).message || "NECTAR couldn't draft the note — please try again.");
    } finally {
      setDraftBusy(false);
    }
  }

  function acceptNectarDraft() {
    if (!nectarDraft) return;
    setNarrative(nectarDraft);
    setAiCoach(null);
    setShowNarrativeError(false);
  }

  async function handleDraftVariance(phase: "clock_in" | "clock_out") {
    const shorthand = phase === "clock_in" ? varShorthand.trim() : outVarShorthand.trim();
    if (shorthand.length < 2) {
      toast.error("Add a few words first — NECTAR will expand it.");
      return;
    }
    const v = phase === "clock_in" ? variance : outVariance;
    const clientFirst =
      lockedClient?.name?.split(" ")?.[0] ??
      caseload.find((c) => c.id === (active?.client_id ?? selectedClientId))?.first_name ??
      "the client";
    const setBusyFn = phase === "clock_in" ? setVarDraftBusy : setOutVarDraftBusy;
    setBusyFn(true);
    try {
      const res = await draftVarianceJustification({
        data: {
          shorthand,
          distanceFeet: v?.distanceFeet ?? null,
          limitFeet:    v?.limitFeet ?? null,
          serviceCode:  serviceCode || null,
          clientFirstName: clientFirst,
          phase,
          frameBlocked: phase === "clock_in" ? !!variance?.frameBlocked : false,
        },
      });
      if (phase === "clock_in") {
        setVarianceReason(res.draft);
      } else {
        setOutVarianceReason(res.draft);
      }
      toast.success("Draft ready — review and edit before submitting.");
    } catch (e) {
      toast.error((e as Error).message || "NECTAR couldn't draft a justification.");
    } finally {
      setBusyFn(false);
    }
  }

  async function handleAskNectar() {
    const q = askQuestion.trim();
    if (q.length < 4) {
      toast.error("Type your question first.");
      return;
    }
    const clientFirst =
      lockedClient?.name?.split(" ")?.[0] ??
      caseload.find((c) => c.id === (active?.client_id ?? selectedClientId))?.first_name ??
      "the client";
    const goals = lockedClient?.pcspGoals ?? [];
    setAskBusy(true);
    setAskResult(null);
    try {
      const res = await answerProceduralQuestion({
        data: {
          question: q,
          clientFirstName: clientFirst,
          serviceCode: serviceCode || null,
          pcspGoals: goals,
          notes: null,
        },
      });
      setAskResult(res);
    } catch (e) {
      toast.error((e as Error).message || "NECTAR couldn't answer right now.");
    } finally {
      setAskBusy(false);
    }
  }


  // ── Compliance gate (billing_conflict detector) at clock-out ────────────
  // Growth-adaptive: one useComplianceGate call, its own buildInput/buildSubject,
  // plus a restrict-vs-override branch. Engine (dialog, rules, flags, history,
  // freeze trigger, raise/resolve fns) and detector registry are UNTOUCHED.
  const { role } = usePermissions();
  const canOverrideCompliance =
    role === "admin" || role === "manager" || role === "super_admin";
  const detectBillingConflict = useServerFn(checkBillingEntry);
  const detectStaffPrereq = useServerFn(checkStaffPrerequisite);
  const raiseComplianceFlagFn = useServerFn(raiseComplianceFlag);

  type EvvGatePayload = {
    clientId: string;
    serviceDate: string;
    serviceCodes: string[];
    staffId: string;
    timesheetId: string;
  };
  const { gate: evvComplianceGate, dialogElement: complianceDialogEl } =
    useComplianceGate<EvvGatePayload>({
      organizationId: org?.organization_id ?? "",
      detector: "billing",
      buildInput: (p) => ({
        clientId: p.clientId,
        serviceDate: p.serviceDate,
        serviceCodes: p.serviceCodes,
        staffId: p.staffId,
      }),
      buildSubject: (p) => ({
        timesheet_id: p.timesheetId,
        client_id: p.clientId,
        date: p.serviceDate,
        staff_id: p.staffId,
        source: "evv_close",
      }),
    });

  // ── Compliance gate (staff_prerequisite detector) at clock-in ───────────
  // Second surface on the same growth-adaptive contract: one hook call,
  // its own buildInput/buildSubject, restrict-vs-override branch. Engine,
  // registry, dialog, and raise/resolve fns are UNTOUCHED.
  type EvvClockInGatePayload = {
    clientId: string;
    staffId: string;
    serviceCodes: string[];
    at: string;
  };
  const { gate: evvClockInGate, dialogElement: clockInComplianceDialogEl } =
    useComplianceGate<EvvClockInGatePayload>({
      organizationId: org?.organization_id ?? "",
      detector: "staffPrereq",
      buildInput: (p) => ({
        staffId: p.staffId,
        serviceCodes: p.serviceCodes,
        clientId: p.clientId,
        at: p.at,
      }),
      buildSubject: (p) => ({
        client_id: p.clientId,
        date: p.at.slice(0, 10),
        staff_id: p.staffId,
        service_codes: p.serviceCodes,
        source: "evv_clock_in",
      }),
    });

  /**
   * Preserve the punch without finalizing billable commit. Persists
   * documentation fields already gathered by staff (clock-out timestamps,
   * narrative, goals, GPS, timezone, outside-geofence reason) but withholds
   * `billed_units` — that field is the "billable finalize done" marker the
   * supervisor queue keys off. `billed_units IS NULL` + a clock-out + an
   * OPEN evv_close flag identifies a held timesheet.
   */
  async function preservePunchOnly(clockOutIso: string, fullUpdate: Record<string, unknown>) {
    if (!active) return;
    // Strip the billable-commit marker; keep everything staff already filled in.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { billed_units, ...preserved } = fullUpdate;
    await supabase
      .from("evv_timesheets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        ...preserved,
        clock_out_timestamp: clockOutIso,
        raw_clock_out: clockOutIso,
        rounded_clock_out: roundToQuarterHourISO(clockOutIso),
      } as any)
      .eq("id", active.id);
    await qc.invalidateQueries({ queryKey: ["evv-active", user?.id] });
  }


  /** Gather all other service codes committed for this client on this date. */
  async function gatherDayCommittedCodes(
    clientId: string,
    dateISO: string,
    excludeTimesheetId: string,
  ): Promise<string[]> {
    const dayStart = `${dateISO}T00:00:00`;
    const dayEnd = `${dateISO}T23:59:59.999`;
    const [shiftsRes, tsRes] = await Promise.all([
      supabase
        .from("scheduled_shifts")
        .select("service_code")
        .eq("client_id", clientId)
        .gte("starts_at", dayStart)
        .lte("starts_at", dayEnd),
      supabase
        .from("evv_timesheets")
        .select("id, service_type_code")
        .eq("client_id", clientId)
        .gte("clock_in_timestamp", dayStart)
        .lte("clock_in_timestamp", dayEnd),
    ]);
    const codes = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (shiftsRes.data ?? []).forEach((r: any) => {
      if (r?.service_code) codes.add(String(r.service_code).toUpperCase());
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tsRes.data ?? []).forEach((r: any) => {
      if (r?.id !== excludeTimesheetId && r?.service_type_code) {
        codes.add(String(r.service_type_code).toUpperCase());
      }
    });
    return Array.from(codes);
  }

  async function finalizeClockOut(args: {
    pos: { lat: number; lng: number; acc: number } | null;
    outsideReason?: string;
    aiStatus?: "Verified" | "Flagged" | "Exception";
    aiFeedback?: string;
    aiIterationCount?: number;
    correction?: {
      correctedInIso: string | null;
      correctedOutIso: string | null;
      reason: string;
    };
  }) {
    if (!user || !active) return;

    const selectedGoals = Object.entries(checkedGoals)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (baselineChecked) selectedGoals.push("General baseline monitoring & safety oversight");

    const clockOut = new Date().toISOString();
    const update: Record<string, unknown> = {
      clock_out_timestamp:  clockOut,
      gps_out_coordinates:  args.pos
        ? { latitude: args.pos.lat, longitude: args.pos.lng, accuracy_meters: args.pos.acc }
        : { latitude: null, longitude: null, accuracy_meters: null },
      status:               "Pending",
      timezone_setting:     "America/Denver",
      shift_note_text:      narrative.trim(),
      goals_completed:      selectedGoals,
      raw_clock_out:        clockOut,
      rounded_clock_out:    roundToQuarterHourISO(clockOut),
      // Per-entry quarter-hour units (round-to-NEAREST); raw timestamps stay untouched.
      billed_units:         computeEntryUnits(active.clock_in_timestamp, clockOut),
    };
    if (nectarUsed) {
      update.nectar_drafted = true;
      update.nectar_drafted_confirmed_at = clockOut;
      update.nectar_drafted_confirmed_by = user.id;
    }
    if (args.outsideReason) update.outside_geofence_reason = args.outsideReason;
    if (incidentFlag || incidentReportIds.length > 0) {
      update.incident_flag = true;
    }
    if (args.aiStatus) {
      update.ai_compliance_status    = args.aiStatus;
      update.ai_compliance_feedback  = args.aiFeedback ?? null;
      update.ai_coaching_iterations  = args.aiIterationCount ?? 0;
    }

    // Staff-requested time correction: never mutate raw punches. Write
    // corrected_clock_in/out, edit_reason, and route to supervisor via
    // review_status='needs_review'. Corrected times only become effective
    // for billing after the supervisor approves (see billing-units.ts).
    if (args.correction) {
      const { correctedInIso, correctedOutIso, reason } = args.correction;
      if (correctedInIso) update.corrected_clock_in = correctedInIso;
      // If the staff didn't correct the out time, use the just-recorded
      // clock-out — supervisors need a corrected pair to review a variance.
      update.corrected_clock_out = correctedOutIso ?? clockOut;
      update.edit_reason = reason.trim();
      update.review_status = "needs_review";
      update.edited_by = user.id;
      update.edited_at = clockOut;
      const auditEntry = {
        kind: "staff_correction_request",
        requested_by: user.id,
        requested_at: clockOut,
        from: {
          clock_in: active.clock_in_timestamp,
          clock_out: clockOut,
        },
        to: {
          clock_in: correctedInIso ?? active.clock_in_timestamp,
          clock_out: correctedOutIso ?? clockOut,
        },
        reason: reason.trim(),
      };
      // Append to edit_audit_history_log without clobbering existing entries.
      const { data: existing } = await supabase
        .from("evv_timesheets")
        .select("edit_audit_history_log")
        .eq("id", active.id)
        .maybeSingle();
      const prior = Array.isArray(existing?.edit_audit_history_log)
        ? (existing!.edit_audit_history_log as unknown[])
        : [];
      update.edit_audit_history_log = [...prior, auditEntry];
    }

    // ── Compliance gate: check confirmed billing_conflict rules against the
    // FULL set of codes committed for this client on this date, plus this
    // timesheet's code. Provider (admin/manager) decides via dialog; staff
    // is restricted — punch preserved, billable commit held.
    const serviceDateISO = clockOut.slice(0, 10);
    const orgId = org?.organization_id ?? "";
    const runFullCommit = async (): Promise<{ ok: true }> => {
      const { error } = await supabase
        .from("evv_timesheets")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(update as any)
        .eq("id", active.id);
      if (error) throw error;
      return { ok: true };
    };

    if (orgId) {
      const otherCodes = await gatherDayCommittedCodes(
        active.client_id,
        serviceDateISO,
        active.id,
      );
      const allCodes = Array.from(
        new Set(
          [active.service_type_code, ...otherCodes]
            .filter(Boolean)
            .map((c) => String(c).toUpperCase()),
        ),
      );

      if (canOverrideCompliance) {
        // Admin/manager: dialog opens with acknowledge / stop.
        const gateResult = await evvComplianceGate(
          {
            clientId: active.client_id,
            serviceDate: serviceDateISO,
            serviceCodes: allCodes,
            staffId: user.id,
            timesheetId: active.id,
          },
          runFullCommit,
        );
        // On Stop: preserve punch (do NOT discard timestamp) and halt.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (gateResult && (gateResult as any).stopped) {
          await preservePunchOnly(clockOut, update);
          toast.message(
            "Punch preserved. Billable commit halted per your compliance decision.",
          );
          return;
        }
      } else {
        // Staff (no override): detect directly; if conflict, raise OPEN flags
        // for audit, preserve punch, and route to supervisor.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detected = (await detectBillingConflict({
          data: {
            organizationId: orgId,
            clientId: active.client_id,
            serviceDate: serviceDateISO,
            serviceCodes: allCodes,
            staffId: user.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        })) as { flags: Array<{ ruleId: string; requirementId: string; matchedCodes: string[]; source: { title: string; verbatim: string; citation: string | null } }> };
        if (detected?.flags?.length) {
          for (const c of detected.flags) {
            try {
              await raiseComplianceFlagFn({
                data: {
                  organizationId: orgId,
                  ruleId: c.ruleId,
                  requirementId: c.requirementId,
                  detectionType: "billing_conflict",
                  subjectContext: {
                    timesheet_id: active.id,
                    client_id: active.client_id,
                    date: serviceDateISO,
                    staff_id: user.id,
                    source: "evv_close",
                    matchedCodes: c.matchedCodes,
                    restricted_for_role: role ?? "unknown",
                  },
                  sourceSnapshot: c.source,
                },
              });
            } catch {
              // Non-fatal: continue raising remaining flags.
            }
          }
          await preservePunchOnly(clockOut, update);
          toast.error(
            "Clock-out held for compliance review. Your punch time is saved — a supervisor must resolve the flagged conflict before this timesheet can be finalized.",
          );
          return;
        }
        // No conflict — proceed to normal commit below.
        await runFullCommit();
      }
    } else {
      // No org context — fall back to the raw update (legacy behavior).
      await runFullCommit();
    }


    // Persist any unresolved / dismissed-with-reason completeness flags for the admin Task Center.
    if (org?.organization_id && completenessFlags.length > 0) {
      const rows = completenessFlags
        .filter((f) => f.severity === "soft") // hard issues couldn't have gotten here
        .map((f) => ({
          organization_id: org.organization_id,
          shift_id: active.id,
          client_id: active.client_id,
          staff_id: user.id,
          flag_type: f.type,
          severity: f.severity,
          message: f.message,
          fix_route: f.fix?.route ?? null,
          status: dismissals[f.key] ? "dismissed_with_reason" : "pending",
          dismissal_reason: dismissals[f.key] ?? null,
        }));
      if (rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("shift_completeness_flags").insert(rows as any);
      }
    }

    // Persist post-shift Behavior Observations when the provider has the feature on.
    if (behaviorEnabled && org?.organization_id) {
      const b = behaviorAnswers;
      const obs = {
        organization_id: org.organization_id,
        shift_id: active.id,
        client_id: active.client_id,
        staff_id: user.id,
        observed_at: clockOut,
        behaviors_observed: b.behaviorsObserved === true,
        target_behaviors: b.behaviorsObserved ? b.targetBehaviors : [],
        behavior_counts: b.behaviorsObserved ? b.counts : {},
        objective_description: b.behaviorsObserved ? b.objectiveDescription.trim() || null : null,
        antecedent_context:    b.behaviorsObserved ? b.antecedentContext.trim() || null : null,
        intervention_response: b.behaviorsObserved ? b.interventionResponse.trim() || null : null,
        reportable_incident:   b.behaviorsObserved ? b.reportableIncident : false,
        positives:             b.positives.trim() || null,
        trend_vs_recent:       b.trendVsRecent || null,
      };
      const { error: behErr } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("shift_behavior_observations" as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(obs as any, { onConflict: "shift_id" });
      if (behErr) {
        // Non-blocking: shift is already saved. Surface a soft toast.
        toast.error(`Behavior observations not saved: ${behErr.message}`);
      }
    }

    // Medication compliance is now recorded in the real MAR (`emar_logs`) via
    // the eMAR tab — no shadow attestation write here.








    const duration = fmtElapsed(
      new Date(clockOut).getTime() - new Date(active.clock_in_timestamp).getTime(),
    );
    setShowCompliance(false);
    setOutVariance(null);
    setOutVarianceReason("");
    setSuccess({
      duration,
      evvClean: !args.outsideReason && !args.correction,
      correctionSubmitted: !!args.correction,
    });
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
    if (nectarUsed && !draftConfirmed) {
      toast.error("Please review the NECTAR-drafted note and check the confirmation box before submitting.");
      return;
    }
    if (behaviorEnabled && behaviorError) {
      toast.error(`Behavior observations: ${behaviorError}`);
      return;
    }
    if (!triggersResolved) {
      toast.error("Resolve the NECTAR trigger(s) in your note before submitting.");
      return;
    }
    if (!medDosesResolved) {
      toast.error("Log all scheduled medication doses in eMAR before submitting.");
      return;
    }
    if (correctionOpen && !correctionValid) {
      if (!correctionHasChange) {
        toast.error("Enter the corrected clock-in and/or clock-out time.");
      } else if (!correctionReasonOk) {
        toast.error("Add a short reason (at least 10 characters) for the correction.");
      } else if (!correctionOrderOk) {
        toast.error("Corrected clock-out must be after the corrected clock-in.");
      } else if (!correctionWithinWindow) {
        toast.error("Correction times are outside the allowed window for this shift.");
      } else {
        toast.error("Fix the time-correction fields before submitting.");
      }
      return;
    }
    const correctionPayload = correctionOpen
      ? {
          correctedInIso: correctionInIso,
          correctedOutIso: correctionOutIso,
          reason: correctionReason,
        }
      : undefined;
    // Hard gate: if staff toggled the clock-out incident flag (or a Nectar
    // trigger fired), require a SUBMITTED Incident Report on this shift.
    if (incidentFlag && incidentReportIds.length === 0) {
      toast.error("You marked an incident — submit the Incident Report before submitting the timesheet.");
      setIncidentDialogOpen(true);
      return;
    }

    // NECTAR Completeness Check (Infusion only). Without infusion, basic field
    // validation above is sufficient — the cross-checks are the locked layer.
    if (nectarInfusionEnabled) {
      let flags = completenessFlags;
      if (!completenessRan) {
        flags = await runCompletenessCheck();
      }
      const hardOpen = flags.some((f) => f.severity === "hard");
      const softOpen = flags.some(
        (f) => f.severity === "soft" && !dismissals[f.key],
      );
      if (hardOpen) {
        toast.error("Fix the required items flagged by NECTAR before submitting.");
        return;
      }
      if (softOpen) {
        toast.error("Resolve or dismiss-with-reason each NECTAR completeness flag.");
        return;
      }
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
      const isEvv = isEvvLockedCode(active.service_type_code);

      // Sequence GPS acquisition: never block a non-EVV clock-out on a fix.
      let pos = livePosRef.current ?? livePos;
      if (!pos && isEvv) {
        if (hardwareDenied) {
          toast.error("Location access blocked. Check that location permission is enabled, then try again.");
          return;
        }
        setAwaitingGps(true);
        try {
          const deadline = Date.now() + 15_000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 250));
            if (livePosRef.current) { pos = livePosRef.current; break; }
          }
        } finally {
          setAwaitingGps(false);
        }
        if (!pos) {
          toast.error("Couldn't get a location fix. Check that location permission is enabled, then try again.");
          return;
        }
      }

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
        pos &&
        isEvv &&
        typeof lat === "number" && typeof lng === "number" &&
        isFinite(lat) && isFinite(lng)
      ) {
        // Low-confidence fixes can't auto-pass the geofence or match approved locations.
        if (!gpsConfident) {
          setOutVariance({ distanceFeet: undefined, limitFeet: radius, pos });
          setOutVarianceReason("");
          return;
        }
        // Approved locations suppress the variance prompt on clock-out too.
        const matchedOut = matchApprovedLocation({ lat: pos.lat, lng: pos.lng });
        const dist = haversineFeet({ lat, lng }, { lat: pos.lat, lng: pos.lng });
        if (!matchedOut && dist > radius) {
          setOutVariance({ distanceFeet: Math.round(dist), limitFeet: radius, pos });
          setOutVarianceReason("");
          return;
        }
      }

      // Stage 5 — required_before_clockout front-guard. READ-ONLY against
      // evv_timesheets; ALWAYS fail-open. Runs BEFORE finalizeClockOut;
      // finalizeClockOut's update object is unchanged.
      if (active) {
        const pendingOut = await fetchPendingTrackingForms({
          tier: "clockout",
          shiftId: active.id,
          clientId: active.client_id,
          serviceCode: active.service_type_code,
        });
        if (pendingOut.length) {
          const finalize = () =>
            finalizeClockOut({
              pos,
              aiStatus: aiStatusForRow,
              aiFeedback: aiFeedbackForRow,
              aiIterationCount: iterationsToPersist,
              correction: correctionPayload,
            });
          setPendingFormsDialog({
            mode: "clockout",
            pending: pendingOut,
            proceed: async () => {
              setPendingFormsDialog(null);
              setBusy(true);
              try { await finalize(); } finally { setBusy(false); }
            },
            recheck: async () => {
              const again = await fetchPendingTrackingForms({
                tier: "clockout",
                shiftId: active.id,
                clientId: active.client_id,
                serviceCode: active.service_type_code,
              });
              if (!again.length) {
                setPendingFormsDialog(null);
                setBusy(true);
                try { await finalize(); } finally { setBusy(false); }
              } else {
                setPendingFormsDialog((p) => p ? { ...p, pending: again } : p);
              }
            },
          });
          return;
        }
      }

      await finalizeClockOut({
        pos,
        aiStatus: aiStatusForRow,
        aiFeedback: aiFeedbackForRow,
        aiIterationCount: iterationsToPersist,
        correction: correctionPayload,
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
      // Stage 5 — fail-open clock-out guard for the variance path too.
      if (active) {
        const pendingOut = await fetchPendingTrackingForms({
          tier: "clockout",
          shiftId: active.id,
          clientId: active.client_id,
          serviceCode: active.service_type_code,
        });
        if (pendingOut.length) {
          const pos = outVariance.pos;
          const outside = reason;
          const finalize = () => finalizeClockOut({ pos, outsideReason: outside });
          setPendingFormsDialog({
            mode: "clockout",
            pending: pendingOut,
            proceed: async () => {
              setPendingFormsDialog(null);
              setBusy(true);
              try { await finalize(); } finally { setBusy(false); }
            },
            recheck: async () => {
              const again = await fetchPendingTrackingForms({
                tier: "clockout",
                shiftId: active.id,
                clientId: active.client_id,
                serviceCode: active.service_type_code,
              });
              if (!again.length) {
                setPendingFormsDialog(null);
                setBusy(true);
                try { await finalize(); } finally { setBusy(false); }
              } else {
                setPendingFormsDialog((p) => p ? { ...p, pending: again } : p);
              }
            },
          });
          return;
        }
      }

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
  const endIsEvv = isEvvLockedCode(active?.service_type_code ?? "");
  const startIsEvv = isEvvLockedCode(serviceCode);
  const padAriaLabel = isRunning
    ? (endIsEvv ? "EVV Shift Punch Pad" : "Time Clock")
    : (startIsEvv ? "EVV Shift Punch Pad" : "Time Clock");

  return (
    <EvvConsentGate>
      <section
        aria-label={padAriaLabel}
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

        {/* ── NECTAR Shift Pre-Flight (pre-clock-in only) ── */}
        {!isRunning && clientForPunch && serviceCode && (
          <NectarInfusionLock
            featureName="Shift pre-flight"
            benefit="NECTAR tells you up front what this shift will need at clock-out — so end-of-shift isn't a surprise."
            className="mb-4"
          >
            <div className="rounded-lg border border-[color:var(--amber-300)] bg-[color:var(--amber-50)]/70 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">
                <Hexagon className="h-3.5 w-3.5" /> NECTAR · Pre-flight
              </p>
              <p className="mt-1 text-[12px] leading-snug text-[color:var(--navy-900)]">
                <span className="font-semibold">
                  {serviceCode} shift with {clientForPunch.name.split(" ")[0]}
                </span>{" "}
                — at clock-out you'll need:
              </p>
              <ul className="mt-1 space-y-0.5 text-[12px] leading-snug text-[color:var(--navy-900)]/90">
                <li>• A progress note (50-word minimum, objective)</li>
                <li>• At least one PCSP goal checked
                  {clientForPunch.pcspGoals?.length
                    ? ` (${clientForPunch.pcspGoals.length} on file)`
                    : " (none on file — ask your supervisor)"}
                </li>
                {isEvvLockedCode(serviceCode) && (
                  <li>• In-radius clock-out, or a written variance</li>
                )}
                <li>• Any spending or reimbursement entries logged before submitting</li>
              </ul>
              <p className="mt-1.5 text-[11px] text-[color:var(--navy-900)]/70">
                Tip: you can draft the note from shorthand or voice at clock-out.
              </p>
            </div>
          </NectarInfusionLock>
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
              disabled={isRunning || !clientForPunch || (lockServiceCode && !!presetServiceCode)}
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
            {lockServiceCode && presetServiceCode ? (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-accent">
                <Lock className="h-3 w-3" />
                Locked from today&apos;s schedule — prevents billing errors.
              </p>
            ) : clientForPunch?.authorizedCodes?.length ? (
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
              aria-label={endIsEvv ? "End EVV Shift" : "Clock Out"}
            >
              {busy
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <><Square className="h-5 w-5 fill-current" /> {endIsEvv ? "⏹️ END EVV SHIFT" : "⏹️ CLOCK OUT"}</>}
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
                aria-label={startIsEvv ? "Start EVV Shift" : "Clock In"}
              >
                {busy
                  ? <Loader2 className="h-10 w-10 animate-spin" />
                  : <Play className="h-10 w-10 fill-current" />}
              </button>
            </div>
            <p className="mt-3 text-center text-sm font-semibold uppercase tracking-wider">
              {startIsEvv ? "▶️ START EVV SHIFT" : "▶️ CLOCK IN"}
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

        {/* ── NECTAR Procedural Q&A (embedded, plain-language) ── */}
        <NectarInfusionLock
          featureName="Ask NECTAR (procedural)"
          benefit="Plain-language answers to 'am I allowed to…?' questions, grounded in this client's plan and your company policy."
          className="mt-4"
        >
          <div className="rounded-lg border border-[color:var(--border-light)] bg-background/60 p-3">
            <button
              type="button"
              onClick={() => setAskOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={askOpen}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-[color:var(--navy-900)]">
                <Hexagon className="h-3.5 w-3.5 text-[color:var(--amber-600)]" />
                Ask NECTAR — "am I allowed to…?"
              </span>
              <span className="text-[11px] text-muted-foreground">{askOpen ? "Hide" : "Open"}</span>
            </button>

            {askOpen && (
              <div className="mt-3 space-y-2">
                <Textarea
                  rows={2}
                  value={askQuestion}
                  onChange={(e) => setAskQuestion(e.target.value)}
                  placeholder='e.g. "Can I take Blake out of county?" or "What if he refuses a med?"'
                  maxLength={500}
                  className="text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Grounded in {lockedClient?.name?.split(" ")[0] ?? "this client"}&apos;s plan when available. You still take the action.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleAskNectar}
                    disabled={askBusy || askQuestion.trim().length < 4}
                    className="bg-[color:var(--amber-500)] text-[color:var(--navy-900)] hover:bg-[color:var(--amber-600)]"
                  >
                    {askBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                    Ask
                  </Button>
                </div>

                {askResult && (
                  <div
                    className={`rounded-md border p-3 text-[13px] leading-snug ${
                      askResult.escalate
                        ? "border-rose-300 bg-rose-50 text-rose-900"
                        : "border-[color:var(--amber-300)] bg-[color:var(--amber-50)] text-[color:var(--navy-900)]"
                    }`}
                  >
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                      {askResult.escalate ? (
                        <><AlertTriangle className="h-3.5 w-3.5" /> Escalate now</>
                      ) : (
                        <><Hexagon className="h-3.5 w-3.5" /> NECTAR · Confidence: {askResult.confidence}</>
                      )}
                    </p>
                    <p className="mt-1">{askResult.answer}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Guidance only — confirm against your supervisor or company policy before acting.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </NectarInfusionLock>



        {/* ════════════════════════════════════════════════════════════════════
            DIALOGS
        ════════════════════════════════════════════════════════════════════ */}

        {/* Stage 5 — per-shift tracking-form front-guard dialog */}
        <PendingTrackingFormsDialog
          open={!!pendingFormsDialog}
          mode={pendingFormsDialog?.mode ?? "clockout"}
          pending={pendingFormsDialog?.pending ?? []}
          busy={busy}
          onClose={() => setPendingFormsDialog(null)}
          onProceedAfterRecheck={
            pendingFormsDialog ? () => pendingFormsDialog.recheck() : undefined
          }
          onSkipWithReason={
            pendingFormsDialog?.mode === "clockout"
              ? async (skipReason) => {
                  // Sole write from the guard: shift_completeness_flags row(s).
                  // evv_timesheets is NOT written here.
                  if (org?.organization_id && user && active && pendingFormsDialog) {
                    const rows = pendingFormsDialog.pending.map((p) => ({
                      organization_id: org.organization_id,
                      shift_id: active.id,
                      client_id: active.client_id,
                      staff_id: user.id,
                      flag_type: "tracking_form_missing",
                      severity: "soft",
                      message: `Required tracking form "${p.formName}" skipped at clock-out.`,
                      status: "dismissed_with_reason",
                      dismissal_reason: skipReason,
                    }));
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      await supabase.from("shift_completeness_flags").insert(rows as any);
                    } catch {
                      // Best-effort; never trap caregiver because of flag insert.
                    }
                  }
                  await pendingFormsDialog?.proceed();
                }
              : undefined
          }
        />

        {/* Clock-in variance — text only, no map */}
        <Dialog open={!!variance} onOpenChange={(o) => { if (!o) { setVariance(null); setVarianceReason(""); setVarShorthand(""); } }}>
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
            <NectarInfusionLock
              featureName="NECTAR variance rescue"
              benefit="Type a few words and NECTAR drafts an auditor-ready justification. You always review and confirm before submitting."
            >
              <div className="rounded-md border border-[color:var(--amber-300)] bg-[color:var(--amber-50)]/60 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">
                  <Hexagon className="h-3.5 w-3.5" /> NECTAR · Variance rescue
                </p>
                <Textarea
                  rows={2}
                  value={varShorthand}
                  onChange={(e) => setVarShorthand(e.target.value)}
                  placeholder='Shorthand — e.g. "GPS off on phone, at house" or "community outing, library"'
                  maxLength={400}
                  className="mt-2 text-sm"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleDraftVariance("clock_in")}
                    disabled={varDraftBusy || varShorthand.trim().length < 2}
                    className="bg-[color:var(--amber-500)] text-[color:var(--navy-900)] hover:bg-[color:var(--amber-600)]"
                  >
                    {varDraftBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                    Draft justification
                  </Button>
                </div>
              </div>
            </NectarInfusionLock>
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
                {varianceReason.trim().length}/10 characters minimum — review NECTAR drafts before confirming.
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
        <Dialog open={!!outVariance} onOpenChange={(o) => { if (!o) { setOutVariance(null); setOutVarianceReason(""); setOutVarShorthand(""); } }}>
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
                {typeof outVariance.distanceFeet === "number" ? (
                  <>
                    Measured distance:{" "}
                    <span className="font-mono font-semibold">{outVariance.distanceFeet.toLocaleString()} ft</span>
                    {" "}· Allowed:{" "}
                    <span className="font-mono font-semibold">{outVariance.limitFeet.toLocaleString()} ft</span>
                  </>
                ) : (
                  <>
                    GPS accuracy too low to confirm location. A written variance is required. · Allowed:{" "}
                    <span className="font-mono font-semibold">{outVariance.limitFeet.toLocaleString()} ft</span>
                  </>
                )}
              </div>
            )}
            <NectarInfusionLock
              featureName="NECTAR variance rescue"
              benefit="Type a few words and NECTAR drafts an auditor-ready clock-out justification. You always review and confirm."
            >
              <div className="rounded-md border border-[color:var(--amber-300)] bg-[color:var(--amber-50)]/60 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">
                  <Hexagon className="h-3.5 w-3.5" /> NECTAR · Variance rescue
                </p>
                <Textarea
                  rows={2}
                  value={outVarShorthand}
                  onChange={(e) => setOutVarShorthand(e.target.value)}
                  placeholder='Shorthand — e.g. "finished outing at park" or "dropped at day program"'
                  maxLength={400}
                  className="mt-2 text-sm"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleDraftVariance("clock_out")}
                    disabled={outVarDraftBusy || outVarShorthand.trim().length < 2}
                    className="bg-[color:var(--amber-500)] text-[color:var(--navy-900)] hover:bg-[color:var(--amber-600)]"
                  >
                    {outVarDraftBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                    Draft justification
                  </Button>
                </div>
              </div>
            </NectarInfusionLock>
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
                    {success?.correctionSubmitted
                      ? "🕒 Correction Request Submitted"
                      : success?.evvClean
                      ? "✅ Shift Successfully Closed"
                      : "⚠️ Shift Closed with Variance"}
                  </p>
                  <p className={`text-xs ${success?.evvClean ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {success?.correctionSubmitted
                      ? "Your supervisor will review the corrected times before this shift bills."
                      : success?.evvClean
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
                {success?.correctionSubmitted
                  ? "The shift is held for supervisor review. You can track its status on My Time Corrections. If approved, the corrected times replace the recorded times for billing; if denied, you'll see the reviewer's note there."
                  : success?.evvClean
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
            className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh] sm:w-full"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader className="shrink-0 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
              <DialogTitle className="pr-8 text-base sm:text-lg">📋 Shift Verification &amp; Medicaid Compliance Form</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Complete the goals tracker and progress note below to submit your timesheet.
              </DialogDescription>
              {/* Live elapsed — pinned at top */}
              <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Live Duration</span>
                <span className="font-mono text-base font-bold tabular-nums sm:text-lg">{elapsed}</span>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              <div className="grid gap-4">
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
                      const sel = !!checkedGoals[goal];
                      return (
                        <label
                          key={id}
                          htmlFor={id}
                          className={`flex cursor-pointer items-start gap-2 rounded-md border p-1.5 text-sm ${
                            sel ? selectedPill : unselectedPill
                          }`}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--amber-600)]"
                            checked={sel}
                            onChange={(e) => setCheckedGoals((p) => ({ ...p, [goal]: e.target.checked }))}
                          />
                          <span className="break-words">{goal}</span>
                        </label>
                      );
                    })}
                    <div className="my-1 border-t border-dashed border-border" />
                    <label
                      htmlFor="goal-baseline"
                      className={`flex cursor-pointer items-start gap-2 rounded-md border p-1.5 text-sm ${
                        baselineChecked ? selectedPill : unselectedPill
                      }`}
                    >
                      <input
                        id="goal-baseline"
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--amber-600)]"
                        checked={baselineChecked}
                        onChange={(e) => setBaselineChecked(e.target.checked)}
                      />
                      <span className="break-words italic text-muted-foreground">
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

                {/* NECTAR Progress-Note Assist (Infusion add-on) */}
                <NectarInfusionLock
                  featureName="Draft with NECTAR"
                  benefit="Turn quick shorthand (or a voice memo) into a compliant, goal-aligned progress-note draft in seconds. You always review and confirm before it's attached to the timesheet."
                >
                  <div className="rounded-lg border-2 border-dashed border-[color:var(--amber-400)] bg-[color:var(--amber-50)]/60 px-3 py-3 sm:px-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center text-[color:var(--amber-700)]"
                        style={{ clipPath: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)", background: "linear-gradient(135deg, var(--amber-100), var(--amber-200))" }}
                      >
                        <Hexagon className="h-3 w-3" />
                      </span>
                      <div className="flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">NECTAR Infusion</div>
                        <div className="text-sm font-semibold text-[color:var(--navy-900)]">Draft with NECTAR</div>
                      </div>
                    </div>
                    <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                      Jot quick shorthand or tap the mic — NECTAR expands it into a goal-aligned draft you review and confirm.
                    </p>
                    {activeClientGoals.length > 0 && (
                      <div className="mb-2 rounded-md border border-[color:var(--amber-300)] bg-white/70 px-2.5 py-1.5 text-[11px] text-[color:var(--navy-900)]">
                        <span className="font-semibold">PCSP goals to address:</span>{" "}
                        {activeClientGoals.slice(0, 3).join("; ")}
                        {activeClientGoals.length > 3 && ` (+${activeClientGoals.length - 3} more)`}
                      </div>
                    )}
                    <Textarea
                      rows={3}
                      value={shorthand}
                      onChange={(e) => setShorthand(e.target.value)}
                      placeholder="e.g. went to park, Blake talked to two people, bought a soda $2, calm all shift"
                      maxLength={4000}
                      className="min-h-[72px] w-full resize-y bg-white text-sm"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={runDraftWithNectar}
                        disabled={draftBusy || shorthand.trim().length < 3}
                        className="min-h-[44px] bg-[color:var(--amber-600)] text-white hover:bg-[color:var(--amber-700)]"
                      >
                        {draftBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Draft with NECTAR
                      </Button>
                      {speechSupported && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => (isRecording ? stopRecording() : startRecording())}
                          className={`min-h-[44px] border ${isRecording ? selectedPill : unselectedPill}`}
                        >
                          {isRecording ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                          {isRecording ? "Stop voice" : "Speak shorthand"}
                        </Button>
                      )}
                    </div>
                    {nectarDraft && (
                      <div className="mt-3 rounded-md border-2 border-[color:var(--amber-500)] bg-white px-3 py-2.5 shadow-sm">
                        <div className="mb-1.5 flex items-center gap-2">
                          <Hexagon className="h-3.5 w-3.5 text-[color:var(--amber-600)]" fill="currentColor" />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">
                            NECTAR draft — review before confirming
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{nectarDraft}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={acceptNectarDraft}
                            className="min-h-[44px]"
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Use draft &amp; edit below
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => { setNectarDraft(null); setNectarUsed(false); setDraftConfirmed(false); }}
                            className="min-h-[44px]"
                          >
                            Discard draft
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </NectarInfusionLock>

                {/* Narrative */}
                <div className="grid gap-2">
                  <Label htmlFor="evv-narrative">
                    📝 Mandatory Progress Note &amp; Narrative Log
                    {nectarUsed && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[color:var(--amber-400)] bg-[color:var(--amber-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">
                        <Hexagon className="h-2.5 w-2.5" fill="currentColor" /> AI-drafted — your review required
                      </span>
                    )}
                  </Label>
                  <Textarea
                    id="evv-narrative"
                    rows={7}
                    value={narrative}
                    onChange={(e) => {
                      setNarrative(e.target.value);
                      if (showNarrativeError) setShowNarrativeError(false);
                      if (aiCoach) setAiCoach(null);
                      if (draftConfirmed) setDraftConfirmed(false);
                    }}
                    placeholder="Describe client behaviors, choices, goal responses, and any incidents observed during this shift…"
                    maxLength={5000}
                    className={`min-h-[160px] w-full resize-y ${nectarUsed && !draftConfirmed ? "border-[color:var(--amber-500)] bg-[color:var(--amber-50)]/30" : ""}`}
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
                  {nectarUsed && (
                    <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-md border-2 border-[color:var(--amber-400)] bg-[color:var(--amber-50)]/60 px-3 py-2 text-xs">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[color:var(--amber-600)]"
                        checked={draftConfirmed}
                        onChange={(e) => setDraftConfirmed(e.target.checked)}
                      />
                      <span className="leading-relaxed text-[color:var(--navy-900)]">
                        <span className="font-semibold">I've reviewed this note and confirm it accurately reflects the shift.</span>
                        <span className="block text-[10px] text-muted-foreground">
                          NECTAR drafted a starting point — the final narrative is staff-owned. Required before submission.
                        </span>
                      </span>
                    </label>
                  )}
                </div>

                {/* Quick action: file an Incident Report mid-shift without leaving punch-pad. */}
                {active && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      Something happen this shift? File the §1.27 Incident Report now — your supervisor is notified the moment you submit.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setIncidentDialogOpen(true)}
                    >
                      <AlertTriangleIcon className="mr-1 h-3.5 w-3.5 text-amber-600" />
                      File Incident Report
                    </Button>
                  </div>
                )}

                {/* NECTAR trigger gate — on-device lexicon scan; blocks submit until resolved */}
                {active && (
                  <NoteTriggerPrompt
                    text={narrative}
                    clientId={active.client_id}
                    date={new Date().toISOString().slice(0, 10)}
                    onOpenForm={(kind) => {
                      if (kind === "incident") {
                        // Open the IR dialog inline; submission marks the trigger
                        // resolved AND flips incident_flag on this timesheet row.
                        setIncidentTriggerOpen(true);
                        setIncidentDialogOpen(true);
                        return;
                      }
                      // Appointment: still send staff to the workspace to log it.
                      navigate({ to: `/dashboard/workspace/${active.client_id}` });
                      toast.message("Opened client workspace — log the appointment, then return.");
                    }}
                    onAllResolved={setTriggersResolved}
                  />
                )}

                <IncidentReportDialog
                  open={incidentDialogOpen && !!active}
                  onOpenChange={(o) => {
                    setIncidentDialogOpen(o);
                    if (!o) setIncidentTriggerOpen(false);
                  }}
                  clientId={active?.client_id}
                  triggeredByNoteId={active?.id}
                  triggeredByNoteType={incidentTriggerOpen ? "evv_shift_note_trigger" : "evv_shift_quick_action"}
                  onSubmitted={(id) => {
                    setIncidentReportIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                    setIncidentFlag(true);
                    // Force the NoteTriggerPrompt poll to refetch so the
                    // incident gate clears the moment the IR is submitted.
                    qc.invalidateQueries({
                      queryKey: ["incident-submitted-for", active?.client_id, new Date().toISOString().slice(0, 10)],
                    });
                  }}
                />


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

                {/* Post-shift Behavior Observations (provider-toggled) */}
                {behaviorEnabled && (
                  <BehaviorObservationsBlock
                    value={behaviorAnswers}
                    onChange={setBehaviorAnswers}
                    onOpenIncident={() => navigate({ to: "/dashboard/command-center" })}
                  />
                )}

                {/* Pre-submit medication check — routes staff into the real MAR */}
                {active && org?.organization_id && (
                  <ShiftMedDueCheckSlot
                    organizationId={org.organization_id}
                    clientId={active.client_id}
                    clientName={active.client_name ?? "this client"}
                    clockInIso={active.clock_in_timestamp}
                    emarHref={`/dashboard/workspace/${active.client_id}?tab=mar-emar`}
                    onResolvedChange={setMedDosesResolved}
                  />
                )}



                {/* NECTAR Completeness Check */}
                <NectarInfusionLock
                  featureName="Pre-submit completeness check"
                  benefit="NECTAR cross-checks your shift before submit — purchases mentioned vs spending log, approved reimbursements vs receipts, EVV consistency — so issues get fixed before they become audit flags."
                >
                  <div className="rounded-lg border-2 border-[color:var(--amber-400)]/50 bg-white/60 px-3 py-3 shadow-sm backdrop-blur sm:px-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-[color:var(--navy-900)]">
                        <ShieldCheck className="h-4 w-4 text-[color:var(--amber-600)]" />
                        NECTAR Completeness Check
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { void runCompletenessCheck(); }}
                        disabled={completenessBusy}
                        className="border-[color:var(--amber-600)]/60 text-[color:var(--amber-700)] hover:bg-[color:var(--amber-50)]"
                      >
                        {completenessBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        {completenessRan ? "Re-check" : "Run check"}
                      </Button>
                    </div>

                    {!completenessRan && !completenessBusy && (
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Run a quick check before submitting — catches missing receipts, unlogged purchases, and goal/note mismatches while you can still fix them.
                      </p>
                    )}

                    {completenessRan && completenessFlags.length === 0 && (
                      <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>All clear — paperwork is consistent and complete.</span>
                      </div>
                    )}

                    {completenessFlags.length > 0 && (
                      <ul className="space-y-2">
                        {completenessFlags.map((f) => {
                          const dismissed = !!dismissals[f.key];
                          const isHard = f.severity === "hard";
                          return (
                            <li
                              key={f.key}
                              className={`rounded-md border px-3 py-2 backdrop-blur ${
                                dismissed
                                  ? "border-muted bg-muted/40"
                                  : isHard
                                  ? "border-rose-500/50 bg-rose-500/10"
                                  : "border-[color:var(--amber-500)]/50 bg-[color:var(--amber-50)]/70"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                    isHard
                                      ? "bg-rose-600 text-white"
                                      : "bg-[color:var(--amber-600)] text-white"
                                  }`}
                                >
                                  {isHard ? "!" : "?"}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-xs font-medium leading-snug ${dismissed ? "text-muted-foreground line-through" : "text-[color:var(--navy-900)]"}`}>
                                    {f.message}
                                  </p>
                                  {dismissed && (
                                    <p className="mt-1 text-[10px] italic text-muted-foreground">
                                      Dismissed: {dismissals[f.key]} — admin will review.
                                    </p>
                                  )}
                                  {!dismissed && dismissingKey === f.key && (
                                    <div className="mt-2 space-y-1.5">
                                      <Textarea
                                        rows={2}
                                        value={dismissReasonDraft}
                                        onChange={(e) => setDismissReasonDraft(e.target.value)}
                                        placeholder="Why are you submitting without addressing this?"
                                        className="min-h-[60px] text-xs"
                                      />
                                      <div className="flex gap-1.5">
                                        <Button type="button" size="sm" variant="outline" onClick={() => { setDismissingKey(null); setDismissReasonDraft(""); }} className="h-8 text-[11px]">Cancel</Button>
                                        <Button type="button" size="sm" onClick={() => confirmDismiss(f.key)} className="h-8 text-[11px]">Save reason</Button>
                                      </div>
                                    </div>
                                  )}
                                  {!dismissed && dismissingKey !== f.key && (
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => jumpToFix(f)}
                                        className="h-8 gap-1 text-[11px]"
                                      >
                                        {f.fix?.route ? <ExternalLink className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                                        {f.fix?.label ?? "Fix"}
                                      </Button>
                                      {!isHard && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => { setDismissingKey(f.key); setDismissReasonDraft(""); }}
                                          className="h-8 text-[11px] text-muted-foreground"
                                        >
                                          Dismiss with reason
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </NectarInfusionLock>
              </div>
            </div>


            <div className="shrink-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
              <div className="flex flex-col gap-2">
                {isLongShift && !correctionOpen && (
                  <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-2">
                        <p>
                          This shift shows <span className="font-mono font-semibold">{elapsed}</span>. If you forgot to clock out or the times are wrong, request a time correction below instead of confirming these times.
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-amber-600"
                              checked={longShiftAck}
                              onChange={(e) => setLongShiftAck(e.target.checked)}
                            />
                            These times are accurate
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => active && openCorrectionPanel(active)}
                            className="h-8 border-amber-500/60 text-amber-900 hover:bg-amber-500/20 dark:text-amber-100"
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Request time correction
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Staff-requested time correction panel. Writes to
                    corrected_clock_in/out + edit_reason and routes to
                    supervisor review; raw punches are never mutated. */}
                {!correctionOpen && !isLongShift && active && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => openCorrectionPanel(active)}
                      className="h-8 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="mr-1.5 h-3 w-3" /> The recorded times are wrong — request a correction
                    </Button>
                  </div>
                )}
                {correctionOpen && active && (
                  <div className="rounded-md border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
                    <div className="mb-2 flex items-start gap-2">
                      <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-900 dark:text-amber-100">
                          Request a time correction
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Enter what your clock-in and/or clock-out should have been. Your supervisor reviews the request and either approves the corrected times (they become the billable times) or denies it with a note.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-[11px] font-medium">Corrected clock-in</Label>
                        <input
                          type="datetime-local"
                          value={correctionIn}
                          onChange={(e) => setCorrectionIn(e.target.value)}
                          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Recorded: {new Date(active.clock_in_timestamp).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                      <div>
                        <Label className="text-[11px] font-medium">Corrected clock-out</Label>
                        <input
                          type="datetime-local"
                          value={correctionOut}
                          onChange={(e) => setCorrectionOut(e.target.value)}
                          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Recorded: about to be set to now ({new Date(now).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}).
                        </p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Label className="text-[11px] font-medium">Reason (visible to your supervisor)</Label>
                      <Textarea
                        rows={2}
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        placeholder="e.g. I forgot to clock out — I actually left at 6:15 PM. Or: I clocked in ~15 min late; started at 8:00 AM."
                        className="mt-1 min-h-[60px] text-sm"
                      />
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {correctionReason.trim().length} / 10 min characters
                      </p>
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCorrectionOpen(false);
                          setCorrectionIn("");
                          setCorrectionOut("");
                          setCorrectionReason("");
                        }}
                      >
                        Cancel correction
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end text-[11px]">
                  {hardwareDenied ? (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-800 dark:text-amber-200">
                      ⚠️ Location blocked — check device permission
                    </span>
                  ) : awaitingGps ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Getting location…
                    </span>
                  ) : livePos ? (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-800 dark:text-emerald-200">
                      📍 Location ready ✓
                    </span>
                  ) : (
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
                      📍 Acquiring location…
                    </span>
                  )}
                </div>
                <div
                  className="w-full"
                  onMouseEnter={() => { if (!narrativeOk) setShowNarrativeError(true); }}
                  onClick={() => { if (!narrativeOk) setShowNarrativeError(true); }}
                >
                  <Button
                    type="button"
                    onClick={() => submitCompliance()}
                    disabled={!canSubmitCompliance || aiBusy}
                    className={
                      correctionOpen
                        ? "w-full bg-amber-600 text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                        : "w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                    }
                  >
                    {(busy || aiBusy) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {aiBusy
                      ? "🧠 NECTAR Coach reviewing your note…"
                      : awaitingGps
                      ? "Getting location…"
                      : aiCoach?.status === "Flagged"
                      ? "🔁 Re-Check with NECTAR Coach"
                      : correctionOpen
                      ? "🕒 Submit correction request"
                      : "💾 Submit Final Timesheet"}
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
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* NECTAR compliance flag dialog (admin/manager only; staff is restricted upstream). */}
        {complianceDialogEl}
        {clockInComplianceDialogEl}
      </section>
    </EvvConsentGate>
  );
}

/**
 * Wraps ShiftMedDueCheck with a windowEnd captured ONCE per shift (keyed on
 * clockInIso). The parent re-renders every second to drive the live shift
 * timer; without this the React Query key would change every second and
 * refetch continuously.
 */
function ShiftMedDueCheckSlot(props: {
  organizationId: string;
  clientId: string;
  clientName: string;
  clockInIso: string;
  emarHref: string;
  onResolvedChange: (resolved: boolean) => void;
}) {
  const windowEnd = useMemo(
    () => new Date().toISOString(),
    // Only recompute when the active shift itself changes.
    [props.clockInIso],
  );
  return (
    <ShiftMedDueCheck
      organizationId={props.organizationId}
      clientId={props.clientId}
      clientName={props.clientName}
      windowStart={props.clockInIso}
      windowEnd={windowEnd}
      emarHref={props.emarHref}
      onResolvedChange={props.onResolvedChange}
    />
  );
}

