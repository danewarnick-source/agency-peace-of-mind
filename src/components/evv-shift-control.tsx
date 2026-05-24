import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCaseload } from "@/hooks/use-caseload";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MapPin, ShieldAlert, Loader2, AlertTriangle, Radio, Target } from "lucide-react";
import { toast } from "sonner";
import { jobCodeLabel } from "@/lib/job-codes";
import { roundToQuarterHourIso } from "@/lib/time-rounding";

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  home_latitude: number | null;
  home_longitude: number | null;
  pcsp_goals: string[];
  job_code: string[] | null;
};

type ActiveShift = {
  id: string;
  client_id: string | null;
  clock_in_time: string;
};

const GEOFENCE_MILES = 0.25;

function deviceFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    `${screen.width}x${screen.height}`,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency ?? "",
  ];
  let h = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `fp_${(h >>> 0).toString(16)}`;
}

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Geolocation unsupported"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  });
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

type PendingBypass = {
  lat: number;
  lng: number;
  distance: number;
} | null;

export function EvvShiftControl() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedJobCode, setSelectedJobCode] = useState<string>("");
  const [active, setActive] = useState<ActiveShift | null>(null);
  const [clockingIn, setClockingIn] = useState(false);
  const [showDocLock, setShowDocLock] = useState(false);
  const [pendingBypass, setPendingBypass] = useState<PendingBypass>(null);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<number | null>(null);

  const { data: clients } = useCaseload();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("shifts")
      .select("id, client_id, clock_in_time")
      .eq("user_id", user.id)
      .is("clock_out_time", null)
      .order("clock_in_time", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setActive(data as ActiveShift);
          if (data.client_id) setSelectedClientId(data.client_id);
        }
      });
  }, [user]);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [active]);

  const selectedClient = useMemo(
    () => clients?.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const authorizedCodes = useMemo(
    () => (selectedClient?.job_code ?? []).filter(Boolean),
    [selectedClient]
  );

  // Auto-select when only one code exists; reset when client changes.
  useEffect(() => {
    if (authorizedCodes.length === 1) setSelectedJobCode(authorizedCodes[0]);
    else setSelectedJobCode("");
  }, [selectedClientId, authorizedCodes]);

  const needsCodeChoice = authorizedCodes.length > 1;
  const codeReady = authorizedCodes.length === 0 || Boolean(selectedJobCode);

  const elapsed = active ? now - new Date(active.clock_in_time).getTime() : 0;

  const insertShift = async (opts: {
    lat: number;
    lng: number;
    outsideGeofence: boolean;
    bypassReason: string | null;
  }) => {
    const { data, error } = await supabase
      .from("shifts")
      .insert({
        organization_id: org!.organization_id,
        user_id: user!.id,
        client_id: selectedClientId,
        clock_in_time: roundToQuarterHourIso(new Date()),
        clock_in_lat: opts.lat,
        clock_in_long: opts.lng,
        device_fingerprint: deviceFingerprint(),
        outside_geofence: opts.outsideGeofence,
        clock_in_bypass_reason: opts.bypassReason,
        job_code: selectedJobCode || null,
        status: "active",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("id, client_id, clock_in_time")
      .single();
    if (error) throw error;
    return data as ActiveShift;
  };

  const handleClockIn = async () => {
    if (!selectedClientId) return toast.error("Select a client first");
    if (needsCodeChoice && !selectedJobCode) return toast.error("Select the service type for this shift");
    if (!org || !user || !selectedClient) return;
    setClockingIn(true);
    try {
      const pos = await getPosition().catch((err: GeolocationPositionError | Error) => {
        const code = (err as GeolocationPositionError).code;
        if (code === 1) throw new Error("Location permission denied — EVV requires GPS to clock in.");
        throw new Error("Unable to get your location. Enable GPS and try again.");
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (selectedClient.home_latitude != null && selectedClient.home_longitude != null) {
        const dist = haversineMiles(lat, lng, selectedClient.home_latitude, selectedClient.home_longitude);
        if (dist > GEOFENCE_MILES) {
          // Intercept — require bypass reason
          setPendingBypass({ lat, lng, distance: dist });
          setClockingIn(false);
          return;
        }
      }

      const data = await insertShift({ lat, lng, outsideGeofence: false, bypassReason: null });
      setActive(data);
      toast.success("Clocked in");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clock in");
    } finally {
      setClockingIn(false);
    }
  };

  const handleBypassConfirm = async (reason: string) => {
    if (!pendingBypass || !user || !org) return;
    setClockingIn(true);
    try {
      const data = await insertShift({
        lat: pendingBypass.lat,
        lng: pendingBypass.lng,
        outsideGeofence: true,
        bypassReason: reason,
      });
      setActive(data);
      setPendingBypass(null);
      toast.warning("Clocked in OUTSIDE geofence — flagged for compliance review", {
        description: `${pendingBypass.distance.toFixed(2)} mi from client's home. Reason logged.`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clock in");
    } finally {
      setClockingIn(false);
    }
  };

  const onCompleteShift = () => {
    setActive(null);
    setSelectedClientId("");
    setSelectedJobCode("");
    setShowDocLock(false);
  };

  // Live GPS telemetry — watches position whenever a client is selected so the
  // status strip can show "On-Site" / "Outside Geofence" before clock-in too.
  const [telemetry, setTelemetry] = useState<{
    status: "idle" | "locating" | "locked" | "denied";
    distance: number | null;
  }>({ status: "idle", distance: null });

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setTelemetry({ status: "denied", distance: null });
      return;
    }
    setTelemetry((t) => ({ ...t, status: "locating" }));
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        let distance: number | null = null;
        if (selectedClient?.home_latitude != null && selectedClient?.home_longitude != null) {
          distance = haversineMiles(
            pos.coords.latitude, pos.coords.longitude,
            selectedClient.home_latitude, selectedClient.home_longitude,
          );
        }
        setTelemetry({ status: "locked", distance });
      },
      () => setTelemetry({ status: "denied", distance: null }),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [selectedClient?.id, selectedClient?.home_latitude, selectedClient?.home_longitude]);

  const onSite = telemetry.distance != null && telemetry.distance <= GEOFENCE_MILES;
  const gpsLabel = telemetry.status === "locked"
    ? "GPS: Locked"
    : telemetry.status === "locating"
      ? "GPS: Locating…"
      : telemetry.status === "denied"
        ? "GPS: Denied"
        : "GPS: —";

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-950">
      {/* Stopwatch header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-7 text-white">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`} />
            {active ? "Shift Running" : "Ready to Clock In"}
          </span>
          <span className="font-mono tracking-normal">{new Date(now).toLocaleDateString()}</span>
        </div>
        <div
          className={`mt-3 text-center font-mono text-5xl font-bold leading-none tabular-nums sm:text-6xl ${
            active ? "text-emerald-400" : "text-slate-200"
          }`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatDuration(elapsed)}
        </div>
        <p className="mt-2 text-center text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Hours · Minutes · Seconds
        </p>
      </div>

      {/* Stacked input strip */}
      <div className="divide-y divide-slate-200 px-6 dark:divide-slate-800">
        <div className="flex items-center gap-3 py-3.5">
          <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Customer</span>
          <Select value={selectedClientId} onValueChange={setSelectedClientId} disabled={!!active}>
            <SelectTrigger className="h-9 flex-1 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus:ring-0 focus-visible:ring-0">
              <SelectValue placeholder="Select an individual…" />
            </SelectTrigger>
            <SelectContent>
              {!clients?.length ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No clients yet</div>
              ) : (
                clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {selectedClientId && needsCodeChoice && !active && (
          <div className="flex items-center gap-3 py-3.5">
            <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Service</span>
            <Select value={selectedJobCode} onValueChange={setSelectedJobCode}>
              <SelectTrigger className="h-9 flex-1 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus:ring-0 focus-visible:ring-0">
                <SelectValue placeholder="Pick the billing code…" />
              </SelectTrigger>
              <SelectContent>
                {authorizedCodes.map((code) => (
                  <SelectItem key={code} value={code}>{jobCodeLabel(code)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedClientId && authorizedCodes.length === 1 && (
          <div className="flex items-center gap-3 py-3.5">
            <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Service</span>
            <span className="flex-1 text-sm font-medium">
              <span className="font-mono">{authorizedCodes[0]}</span>
              <span className="ml-2 text-muted-foreground">{jobCodeLabel(authorizedCodes[0])}</span>
            </span>
          </div>
        )}
      </div>

      {/* Weighted punch buttons */}
      <div className="grid grid-cols-2 gap-3 px-6 pt-5">
        <button
          type="button"
          onClick={handleClockIn}
          disabled={!!active || !selectedClientId || !codeReady || clockingIn}
          className={`group flex h-16 items-center justify-center gap-2 rounded-2xl text-base font-bold uppercase tracking-wider text-white shadow-lg transition-all ${
            active
              ? "cursor-not-allowed bg-slate-300 text-slate-500 shadow-none dark:bg-slate-800 dark:text-slate-600"
              : "bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
          }`}
        >
          {clockingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-lg">🟢</span>}
          Clock In
        </button>
        <button
          type="button"
          onClick={() => active && setShowDocLock(true)}
          disabled={!active}
          className={`flex h-16 items-center justify-center gap-2 rounded-2xl text-base font-bold uppercase tracking-wider text-white shadow-lg transition-all ${
            active
              ? "animate-pulse bg-rose-500 hover:animate-none hover:bg-rose-600 active:scale-[0.98]"
              : "cursor-not-allowed bg-slate-300 text-slate-500 shadow-none dark:bg-slate-800 dark:text-slate-600"
          }`}
        >
          <span className="text-lg">🔴</span>
          Clock Out
        </button>
      </div>

      {/* Live telemetry strip */}
      <div className="mx-6 mt-4 mb-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-medium dark:border-slate-800 dark:bg-slate-900/50">
        <span className={`inline-flex items-center gap-1.5 ${telemetry.status === "locked" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}>
          <Radio className={`h-3.5 w-3.5 ${telemetry.status === "locating" ? "animate-pulse" : ""}`} />
          📡 {gpsLabel}
        </span>
        {selectedClient?.home_latitude != null && telemetry.distance != null ? (
          <span className={`inline-flex items-center gap-1.5 ${onSite ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {onSite ? <Target className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {onSite
              ? `🎯 On-Site (${telemetry.distance.toFixed(2)} mi)`
              : `⚠️ Outside Geofence (${telemetry.distance.toFixed(2)} mi)`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            <MapPin className="h-3.5 w-3.5" /> Geofence: {GEOFENCE_MILES} mi
          </span>
        )}
      </div>

      {pendingBypass && (
        <GeofenceBypassModal
          distance={pendingBypass.distance}
          submitting={clockingIn}
          onConfirm={handleBypassConfirm}
          onCancel={() => setPendingBypass(null)}
        />
      )}

      {showDocLock && active && selectedClient && (
        <DocumentationLockModal
          client={selectedClient}
          shiftId={active.id}
          onComplete={onCompleteShift}
        />
      )}
    </div>
  );
}

function GeofenceBypassModal({
  distance, onConfirm, onCancel, submitting,
}: {
  distance: number;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");
  const canSubmit = reason.trim().length >= 10 && !submitting;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !submitting) onCancel(); }}>
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Geofence Verification Deviation
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">EVV Warning:</span> You are outside the designated radius for this individual
            ({distance.toFixed(2)} mi from their home address, threshold {GEOFENCE_MILES} mi).
            To proceed, you must provide an administrative reason for audit tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Label htmlFor="bypass-reason">Reason for Deviation</Label>
          <Textarea
            id="bypass-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="e.g. Met client at community center for inclusion goals"
          />
          <p className={`text-[11px] ${reason.trim().length >= 10 ? "text-muted-foreground" : "text-destructive"}`}>
            {reason.trim().length}/10 characters minimum
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={!canSubmit} variant="destructive">
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Logging…</> : "Confirm & Clock In"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentationLockModal({
  client, shiftId, onComplete,
}: {
  client: Client;
  shiftId: string;
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const [checked, setChecked] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [geo, setGeo] = useState<{
    lat: number | null;
    lng: number | null;
    distance: number | null;
    outside: boolean;
    locating: boolean;
    error: string | null;
  }>({ lat: null, lng: null, distance: null, outside: false, locating: true, error: null });
  const [clockOutReason, setClockOutReason] = useState("");

  // Capture clock-out GPS as soon as modal opens so we can show the bypass UI conditionally.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pos = await getPosition();
        if (cancelled) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let distance: number | null = null;
        let outside = false;
        if (client.home_latitude != null && client.home_longitude != null) {
          distance = haversineMiles(lat, lng, client.home_latitude, client.home_longitude);
          outside = distance > GEOFENCE_MILES;
        }
        setGeo({ lat, lng, distance, outside, locating: false, error: null });
      } catch (e) {
        if (cancelled) return;
        // Treat permission failure as outside geofence — force a deviation reason.
        setGeo({
          lat: null, lng: null, distance: null, outside: true, locating: false,
          error: e instanceof Error ? e.message : "Could not capture location",
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (g: string) => setChecked(
    checked.includes(g) ? checked.filter((x) => x !== g) : [...checked, g]
  );

  const narrativeOk = narrative.trim().length >= 50;
  const bypassOk = !geo.outside || clockOutReason.trim().length >= 10;
  const canSubmit = !geo.locating && narrativeOk && bypassOk && !submitting;

  const submit = async () => {
    if (!user) return;
    if (!narrativeOk) return toast.error("Narrative must be at least 50 characters");
    if (geo.outside && clockOutReason.trim().length < 10) {
      return toast.error("Clock-out deviation reason is required (min 10 characters)");
    }
    setSubmitting(true);
    try {
      const clockOut = new Date().toISOString();

      // Read existing shift to preserve clock-in geofence flag — OR-merge into final outside_geofence.
      const { data: existing } = await supabase
        .from("shifts")
        .select("outside_geofence")
        .eq("id", shiftId)
        .maybeSingle();
      const finalOutside = Boolean(existing?.outside_geofence) || geo.outside;

      const { error: e1 } = await supabase
        .from("shifts")
        .update({
          clock_out_time: clockOut,
          clock_out_lat: geo.lat,
          clock_out_long: geo.lng,
          outside_geofence: finalOutside,
          clock_out_bypass_reason: geo.outside ? clockOutReason.trim() : null,
          status: "pending_approval",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", shiftId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("shift_notes")
        .upsert({
          shift_id: shiftId,
          user_id: user.id,
          goals_addressed: checked,
          narrative_summary: narrative.trim(),
        }, { onConflict: "shift_id" });
      if (e2) throw e2;

      toast.success(finalOutside ? "Shift saved — flagged outside geofence" : "Shift submitted for approval");
      onComplete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit shift");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => { /* non-dismissible */ }}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Mandatory Shift Documentation Lock
          </DialogTitle>
          <DialogDescription>
            Complete all required EVV documentation before closing this shift.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          {/* Geofence status banner */}
          <div className={`rounded-lg border p-3 text-xs ${
            geo.locating
              ? "border-border bg-secondary/40"
              : geo.outside
                ? "border-orange-400 bg-orange-50 text-orange-900 dark:bg-orange-500/10 dark:text-orange-200"
                : "border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
          }`}>
            {geo.locating ? (
              <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturing clock-out GPS coordinates…</span>
            ) : geo.outside ? (
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Clock-out outside geofence.</strong>{" "}
                  {geo.distance != null
                    ? `You are ${geo.distance.toFixed(2)} mi from ${client.first_name}'s home (threshold ${GEOFENCE_MILES} mi).`
                    : geo.error}
                  {" "}A deviation reason is required below.
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" /> Clock-out GPS confirmed on-site
                {geo.distance != null ? ` (${(geo.distance * 5280).toFixed(0)} ft from home).` : "."}
              </span>
            )}
          </div>

          <div>
            <p className="text-sm font-medium">PCSP goals addressed</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Select every goal you worked on with {client.first_name} during this shift.
            </p>
            {client.pcsp_goals.length ? (
              <div className="space-y-2">
                {client.pcsp_goals.map((g) => (
                  <label key={g} className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-secondary/40 p-2 text-sm">
                    <Checkbox checked={checked.includes(g)} onCheckedChange={() => toggle(g)} />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No PCSP goals on file for this client.</p>
            )}
          </div>

          <div>
            <Label htmlFor="narrative">Narrative summary</Label>
            <Textarea
              id="narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={5}
              placeholder="Describe what happened during the shift, interventions used, and the individual's response (min 50 characters)."
              className="mt-1.5"
              maxLength={4000}
            />
            <p className={`mt-1 text-[11px] ${narrativeOk ? "text-muted-foreground" : "text-destructive"}`}>
              {narrative.trim().length}/50 characters minimum
            </p>
          </div>

          {geo.outside && (
            <div>
              <Label htmlFor="clockout-reason" className="text-orange-700 dark:text-orange-300">
                Reason for Clock-Out Deviation
              </Label>
              <Textarea
                id="clockout-reason"
                value={clockOutReason}
                onChange={(e) => setClockOutReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. Dropped client off at authorized family respite location at 555 Main St."
                className="mt-1.5"
              />
              <p className={`mt-1 text-[11px] ${clockOutReason.trim().length >= 10 ? "text-muted-foreground" : "text-destructive"}`}>
                {clockOutReason.trim().length}/10 characters minimum
              </p>
            </div>
          )}

          <Button onClick={submit} disabled={!canSubmit} size="lg">
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : "Submit Documentation & Close Shift"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
