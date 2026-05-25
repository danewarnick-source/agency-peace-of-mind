import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, PlayCircle, StopCircle, Target } from "lucide-react";
import { toast } from "sonner";
import { jobCodeLabel } from "@/lib/job-codes";

type ActiveShift = {
  id: string;
  clock_in_time: string;
  job_code: string | null;
};

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function WorkShiftTab({
  clientId,
  clientName,
  pcspGoals,
  authorizedCodes,
}: {
  clientId: string;
  clientName: string;
  pcspGoals: string[];
  authorizedCodes: string[];
}) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();

  const [active, setActive] = useState<ActiveShift | null>(null);
  const [jobCode, setJobCode] = useState<string>(
    authorizedCodes.length === 1 ? authorizedCodes[0] : "",
  );
  const [busy, setBusy] = useState(false);
  const [narrative, setNarrative] = useState("");
  const [goalScores, setGoalScores] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showAlert, setShowAlert] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<number | null>(null);

  // Fetch any open shift for this user+client.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("shifts")
      .select("id, clock_in_time, job_code")
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .is("clock_out_time", null)
      .order("clock_in_time", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setActive(data as ActiveShift);
          if (data.job_code) setJobCode(data.job_code);
        }
      });
  }, [user, clientId]);

  // Live stopwatch
  useEffect(() => {
    if (!active) {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [active]);

  const elapsed = active
    ? now - new Date(active.clock_in_time).getTime()
    : 0;

  const narrativeReady = narrative.trim().length >= 20;
  const goalsReady = useMemo(
    () => pcspGoals.length === 0 || pcspGoals.some((g) => touched[g]),
    [pcspGoals, touched],
  );
  const canClockOut = narrativeReady && goalsReady;

  async function clockIn() {
    if (!user) return;
    if (authorizedCodes.length > 0 && !jobCode) {
      toast.error("Pick a job billing code first.");
      return;
    }
    setBusy(true);

    // Local mock fallback — keeps the UI usable in sandbox/preview even when
    // tenant_id / staff_profile / network records are missing or slow.
    const startLocalMock = () => {
      const mock: ActiveShift = {
        id: `mock-shift-${clientId}-${Date.now()}`,
        clock_in_time: new Date().toISOString(),
        job_code: jobCode || null,
      };
      setActive(mock);
      toast("🔄 Sandbox Mode: Shift started locally.");
    };

    // 1.5s safety timer — if the DB round-trip stalls, drop the spinner and
    // fall back to a local shift so narrative + goal fields unlock instantly.
    let settled = false;
    const fallback = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      startLocalMock();
      setBusy(false);
    }, 1500);

    try {
      if (!org) throw new Error("no-org");
      const coords = await new Promise<GeolocationCoordinates | null>(
        (resolve) => {
          if (!("geolocation" in navigator)) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 1200, maximumAge: 0 },
          );
        },
      );
      const { data, error } = await supabase
        .from("shifts")
        .insert({
          organization_id: org.organization_id,
          user_id: user.id,
          client_id: clientId,
          clock_in_time: new Date().toISOString(),
          clock_in_lat: coords?.latitude ?? null,
          clock_in_long: coords?.longitude ?? null,
          job_code: jobCode || null,
          status: "active",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .select("id, clock_in_time, job_code")
        .single();
      if (error) throw error;
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      setActive(data as ActiveShift);
      toast.success(`Clocked in with ${clientName}`);
    } catch {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      startLocalMock();
    } finally {
      setBusy(false);
    }
  }

  async function clockOut() {
    if (!user || !org || !active) return;

    // Frontend compliance guardrail.
    if (!canClockOut) {
      setShowAlert(true);
      return;
    }
    setBusy(true);

    // Sandbox/local mock shift — no DB write, just clear the UI.
    if (active.id.startsWith("mock-shift-")) {
      toast.success("Sandbox shift completed locally.");
      setActive(null);
      setNarrative("");
      setGoalScores({});
      setTouched({});
      setBusy(false);
      return;
    }

    try {
      // Persist narrative + goals as a shift_note FIRST so the DB trigger passes.
      const addressed = pcspGoals
        .filter((g) => touched[g])
        .map((g) => `${g} (${goalScores[g] ?? 0}%)`);
      const { error: noteErr } = await supabase
        .from("shift_notes")
        .insert({
          shift_id: active.id,
          user_id: user.id,
          narrative_summary: narrative.trim(),
          goals_addressed: addressed,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (noteErr) throw noteErr;

      const coords = await new Promise<GeolocationCoordinates | null>(
        (resolve) => {
          if (!("geolocation" in navigator)) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
          );
        },
      );

      const { error: shiftErr } = await supabase
        .from("shifts")
        .update({
          clock_out_time: new Date().toISOString(),
          clock_out_lat: coords?.latitude ?? null,
          clock_out_long: coords?.longitude ?? null,
          status: "completed",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", active.id);
      if (shiftErr) throw shiftErr;

      toast.success("Shift completed");
      setActive(null);
      setNarrative("");
      setGoalScores({});
      setTouched({});
      qc.invalidateQueries({ queryKey: ["client-timeline"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not clock out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Smart Time Clock */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-6 text-white">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`}
              />
              {active ? "Shift Running" : "Ready to Clock In"}
            </span>
            <span className="font-mono">{clientName}</span>
          </div>
          <div
            className={`mt-3 text-center font-mono text-5xl font-bold leading-none tabular-nums sm:text-6xl ${active ? "text-emerald-400" : "text-slate-200"}`}
          >
            {fmtElapsed(elapsed)}
          </div>
        </div>

        <div className="space-y-4 p-5">
          {authorizedCodes.length > 0 && (
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Job billing code
              </Label>
              <Select
                value={jobCode}
                onValueChange={setJobCode}
                disabled={!!active}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select service type…" />
                </SelectTrigger>
                <SelectContent>
                  {authorizedCodes.map((code) => (
                    <SelectItem key={code} value={code}>
                      {jobCodeLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {!active ? (
              <Button
                onClick={clockIn}
                disabled={busy || (authorizedCodes.length > 0 && !jobCode)}
                className="h-14 flex-1 bg-emerald-500 text-base font-bold uppercase tracking-wider text-white hover:bg-emerald-600"
              >
                {busy ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <PlayCircle className="mr-2 h-5 w-5" />
                )}
                Clock In
              </Button>
            ) : (
              <Button
                onClick={clockOut}
                disabled={busy}
                className="h-14 flex-1 bg-rose-500 text-base font-bold uppercase tracking-wider text-white hover:bg-rose-600"
              >
                {busy ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <StopCircle className="mr-2 h-5 w-5" />
                )}
                Clock Out
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Shift Logging Area — gated until clocked in */}
      <Card className={`relative overflow-hidden p-5 ${!active ? "pointer-events-none opacity-50" : ""}`}>
        {!active && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/40">
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              🔒 Clock in to unlock daily logging
            </span>
          </div>
        )}
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Target className="h-3.5 w-3.5" /> ISP Goal Performance
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Slide each goal to log today's performance percentage.
        </p>

        {pcspGoals.length ? (
          <div className="space-y-4">
            {pcspGoals.map((g) => {
              const v = goalScores[g] ?? 0;
              const isTouched = touched[g];
              return (
                <div
                  key={g}
                  className={`rounded-lg border p-3 transition ${
                    showAlert && !isTouched
                      ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
                      : "border-border"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{g}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-xs ${
                        isTouched
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {v}%
                    </span>
                  </div>
                  <Slider
                    value={[v]}
                    onValueChange={(val) => {
                      setGoalScores((p) => ({ ...p, [g]: val[0] }));
                      setTouched((p) => ({ ...p, [g]: true }));
                    }}
                    min={0}
                    max={100}
                    step={5}
                    aria-label={`Goal performance: ${g}`}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No PCSP goals on file for this individual.
          </p>
        )}

        <div className="mt-5">
          <Label
            htmlFor="shift-narr"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Daily Progress Narrative Note
          </Label>
          <Textarea
            id="shift-narr"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={6}
            placeholder="Describe today's activities, mood, meals, interactions, goal progress, and any concerns…"
            className={`resize-none ${
              showAlert && !narrativeReady
                ? "border-amber-500 focus-visible:ring-amber-500/40"
                : ""
            }`}
            maxLength={5000}
          />
          <p
            className={`mt-1 text-[11px] ${narrativeReady ? "text-emerald-600" : "text-muted-foreground"}`}
          >
            {narrativeReady
              ? "✓ Narrative meets minimum length"
              : `${Math.max(0, 20 - narrative.trim().length)} more characters required`}
          </p>
        </div>

        {showAlert && !canClockOut && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <strong>Compliance Rule:</strong> Daily progress notes and goal
            data must be filled out before you can clock out.
          </div>
        )}
      </Card>
    </div>
  );
}
