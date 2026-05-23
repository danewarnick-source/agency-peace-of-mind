import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, MapPin, Play, Square, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  home_latitude: number | null;
  home_longitude: number | null;
  pcsp_goals: string[];
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
  // simple non-crypto hash
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
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
  });
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function EvvShiftControl() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [active, setActive] = useState<ActiveShift | null>(null);
  const [clockingIn, setClockingIn] = useState(false);
  const [showDocLock, setShowDocLock] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<number | null>(null);

  const { data: clients } = useQuery({
    enabled: !!org,
    queryKey: ["evv-clients", org?.organization_id],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, home_latitude, home_longitude, pcsp_goals")
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  // Load existing active shift (no clock_out_time) for this user
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

  // Ticker
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

  const elapsed = active ? now - new Date(active.clock_in_time).getTime() : 0;

  const handleClockIn = async () => {
    if (!selectedClientId) return toast.error("Select a client first");
    if (!org || !user) return;
    setClockingIn(true);
    try {
      const pos = await getPosition().catch((err: GeolocationPositionError | Error) => {
        const code = (err as GeolocationPositionError).code;
        if (code === 1) throw new Error("Location permission denied — EVV requires GPS to clock in.");
        throw new Error("Unable to get your location. Enable GPS and try again.");
      });
      const { data, error } = await supabase
        .from("shifts")
        .insert({
          organization_id: org.organization_id,
          user_id: user.id,
          client_id: selectedClientId,
          clock_in_time: new Date().toISOString(),
          clock_in_lat: pos.coords.latitude,
          clock_in_long: pos.coords.longitude,
          device_fingerprint: deviceFingerprint(),
          status: "pending",
        })
        .select("id, client_id, clock_in_time")
        .single();
      if (error) throw error;
      setActive(data as ActiveShift);
      toast.success("Clocked in");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clock in");
    } finally {
      setClockingIn(false);
    }
  };

  const onCompleteShift = () => {
    setActive(null);
    setSelectedClientId("");
    setShowDocLock(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">EVV Shift Control Center</h3>
          <p className="text-xs text-muted-foreground">
            Tamper-evident clock-in with GPS verification and mandatory shift documentation.
          </p>
        </div>
        {active && (
          <div className="rounded-lg border border-border bg-secondary px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active shift</p>
            <p className="font-mono text-lg tabular-nums">{formatDuration(elapsed)}</p>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <Label>Client</Label>
          <Select
            value={selectedClientId}
            onValueChange={setSelectedClientId}
            disabled={!!active}
          >
            <SelectTrigger><SelectValue placeholder="Select the individual you are serving" /></SelectTrigger>
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

        {!active ? (
          <Button onClick={handleClockIn} disabled={!selectedClientId || clockingIn} size="lg">
            {clockingIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Capturing location…</> : <><Play className="mr-2 h-4 w-4" /> Clock In</>}
          </Button>
        ) : (
          <Button onClick={() => setShowDocLock(true)} size="lg" variant="destructive">
            <Square className="mr-2 h-4 w-4" /> Clock Out
          </Button>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" /> GPS + device fingerprint captured on clock-in.
          <Clock className="ml-2 h-3 w-3" /> Geofence radius: {GEOFENCE_MILES} mi
        </p>
      </div>

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

  const toggle = (g: string) => setChecked(
    checked.includes(g) ? checked.filter((x) => x !== g) : [...checked, g]
  );

  const canSubmit = narrative.trim().length >= 50 && !submitting;

  const submit = async () => {
    if (!user) return;
    if (narrative.trim().length < 50) return toast.error("Narrative must be at least 50 characters");
    setSubmitting(true);
    try {
      // capture clock-out location for geofence check
      let outLat: number | null = null;
      let outLng: number | null = null;
      let outsideGeofence = false;
      try {
        const pos = await getPosition();
        outLat = pos.coords.latitude;
        outLng = pos.coords.longitude;
        if (client.home_latitude != null && client.home_longitude != null) {
          const dist = haversineMiles(outLat, outLng, client.home_latitude, client.home_longitude);
          outsideGeofence = dist > GEOFENCE_MILES;
        }
      } catch {
        outsideGeofence = true;
      }

      const clockOut = new Date().toISOString();
      const { error: e1 } = await supabase
        .from("shifts")
        .update({
          clock_out_time: clockOut,
          clock_out_lat: outLat,
          clock_out_long: outLng,
          outside_geofence: outsideGeofence,
          status: "pending_approval",
        })
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

      toast.success(outsideGeofence ? "Shift saved — flagged outside geofence" : "Shift submitted for approval");
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
        className="max-w-lg"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Mandatory Shift Documentation Lock
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
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
            <p className={`mt-1 text-[11px] ${narrative.trim().length >= 50 ? "text-muted-foreground" : "text-destructive"}`}>
              {narrative.trim().length}/50 characters minimum
            </p>
          </div>

          <Button onClick={submit} disabled={!canSubmit} size="lg">
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : "Submit Documentation & Clock Out"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
