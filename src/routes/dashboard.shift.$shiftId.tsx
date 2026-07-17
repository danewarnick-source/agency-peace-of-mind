import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Home,
  Pill,
  PhoneOff,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { computeEntryUnits } from "@/lib/billing-units";
import { monthlySupportHoursTarget } from "@/lib/scheduling/hhs-visit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/shift/$shiftId")({
  head: () => ({ meta: [{ title: "Shift Overview — HIVE" }] }),
  component: ShiftOverviewPage,
});

type Shift = {
  id: string;
  organization_id: string;
  staff_id: string;
  client_id: string;
  code_id: string | null;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  client: { first_name: string | null; last_name: string | null; profile_photo_url: string | null; date_of_birth: string | null; phone_number: string | null; physical_address: string | null; special_directions: string | null; pcsp_goals: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null; medicaid_id: string | null } | null;
  code: { id: string; code: string; label: string | null; kind: string } | null;
};

function ShiftOverviewPage() {
  const { shiftId } = useParams({ from: "/dashboard/shift/$shiftId" });
  const { user } = useAuth();

  const { data: shift, isLoading } = useQuery({
    enabled: !!shiftId,
    queryKey: ["shift-overview", shiftId],
    queryFn: async (): Promise<Shift | null> => {
      const { data, error } = await supabase
        .from("scheduled_shifts")
        .select(
          "id, organization_id, staff_id, client_id, code_id, job_code, starts_at, ends_at, status, notes, client:client_id(first_name,last_name,profile_photo_url,date_of_birth,phone_number,physical_address,special_directions,pcsp_goals,emergency_contact_name,emergency_contact_phone,medicaid_id), code:code_id(id,code,label,kind)",
        )
        .eq("id", shiftId)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading shift…</div>;
  if (!shift) return <div className="p-6 text-sm text-muted-foreground">Shift not found.</div>;

  const clientName = `${shift.client?.first_name ?? ""} ${shift.client?.last_name ?? ""}`.trim() || "Client";
  const codeLabel = shift.code?.code ?? shift.job_code ?? "—";
  const isContinuous = shift.code?.kind === "continuous";

  const visitCode = (shift.code?.code ?? shift.job_code ?? "").toUpperCase();
  const isHhsSupportVisit = visitCode === "HHS";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-24">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/schedule">
            <ArrowLeft className="h-4 w-4 mr-1" /> My Schedule
          </Link>
        </Button>
        <Badge variant={isContinuous ? "secondary" : "default"} className="ml-auto font-mono">
          {isHhsSupportVisit ? "HHS Support Visit" : codeLabel}
        </Badge>
        <Badge variant="outline" className="text-[10px] uppercase">{isContinuous ? "Continuous" : "Discrete"}</Badge>
      </div>

      <ClientProfileCard shift={shift} clientName={clientName} />
      {isHhsSupportVisit && (
        <HhsSupportHoursNote
          organizationId={shift.organization_id}
          clientId={shift.client_id}
          clientFirstName={shift.client?.first_name ?? clientName}
        />
      )}
      <ActiveClockPanel shift={shift} userId={user?.id} />
      {isContinuous && <RhsOverviewPanel shift={shift} />}
      <ShiftReportPanel shift={shift} userId={user?.id} />
      <MarPanel shift={shift} userId={user?.id} />
      <CalloutPanel shift={shift} userId={user?.id} />
    </div>
  );
}

/**
 * For an HHS Support Visit: how this timed visit counts toward the client's
 * per-PCPT Direct Support hours from the DSPD Worksheet. N is the weekly
 * target (client_weekly_targets) converted to a monthly figure (×4.33, "≈").
 */
function HhsSupportHoursNote({
  organizationId, clientId, clientFirstName,
}: {
  organizationId: string;
  clientId: string;
  clientFirstName: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["hhs-support-target", organizationId, clientId],
    queryFn: async (): Promise<number | null> => {
      const { data } = await supabase
        .from("client_weekly_targets")
        .select("target_hours_per_week")
        .eq("organization_id", organizationId)
        .eq("client_id", clientId)
        .eq("service_code", "HHS")
        .maybeSingle();
      return (data?.target_hours_per_week as number | undefined) ?? null;
    },
  });

  if (isLoading) return null;
  const monthly = monthlySupportHoursTarget(data);

  return (
    <section className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
      <Home className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
      <div className="min-w-0 text-xs leading-snug">
        {monthly != null ? (
          <p>
            Counts toward <strong>{clientFirstName}</strong>'s required{" "}
            <strong>≈ {monthly} support hrs/month</strong> (worksheet).
          </p>
        ) : (
          <p>Support hours target not set — ask your admin.</p>
        )}
      </div>
    </section>
  );
}

function ClientProfileCard({ shift, clientName }: { shift: Shift; clientName: string }) {
  const c = shift.client;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
          {c?.profile_photo_url ? (
            <img src={c.profile_photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <User className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight text-foreground">{clientName}</h1>
          <p className="text-xs text-muted-foreground">
            <Clock className="inline h-3 w-3 mr-1" />
            {new Date(shift.starts_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} →{" "}
            {new Date(shift.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
          {c?.physical_address && <p className="mt-1 text-xs text-muted-foreground truncate">{c.physical_address}</p>}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard/workspace/$clientId" params={{ clientId: shift.client_id }}>Full profile</Link>
        </Button>
      </div>
      {(c?.special_directions || c?.pcsp_goals || c?.emergency_contact_name) && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {c?.special_directions && (
            <div className="rounded-md bg-amber-50 p-2 text-amber-900">
              <p className="font-semibold mb-0.5">Special directions</p>
              <p className="whitespace-pre-wrap">{c.special_directions}</p>
            </div>
          )}
          {c?.pcsp_goals && (
            <div className="rounded-md bg-muted/40 p-2">
              <p className="font-semibold mb-0.5">PCSP goals</p>
              <p className="whitespace-pre-wrap">{c.pcsp_goals}</p>
            </div>
          )}
          {c?.emergency_contact_name && (
            <div className="rounded-md bg-muted/40 p-2">
              <p className="font-semibold mb-0.5">Emergency contact</p>
              <p>{c.emergency_contact_name} {c.emergency_contact_phone ? `· ${c.emergency_contact_phone}` : ""}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const getGPS = (): Promise<{ lat: number; lng: number; accuracy?: number }> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 0, lng: 0 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve({ lat: 0, lng: 0 }),
      { timeout: 5000, maximumAge: 30000 },
    );
  });

function ActiveClockPanel({ shift, userId }: { shift: Shift; userId?: string }) {
  const qc = useQueryClient();
  const code = shift.code?.code ?? shift.job_code ?? "";
  const isContinuous = shift.code?.kind === "continuous";

  const { data: org } = useQuery({
    enabled: !!shift.organization_id,
    queryKey: ["org-evv", shift.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("dhhs_provider_id")
        .eq("id", shift.organization_id)
        .maybeSingle();
      return data as { dhhs_provider_id: string | null } | null;
    },
  });

  const { data: activePunch } = useQuery({
    enabled: !!userId,
    queryKey: ["evv-active", userId, shift.client_id, code],
    queryFn: async () => {
      const { data } = await supabase
        .from("evv_timesheets")
        .select("id, clock_in_timestamp, clock_out_timestamp, service_type_code, client_id")
        .eq("staff_id", userId!)
        .is("clock_out_timestamp", null)
        .order("clock_in_timestamp", { ascending: false })
        .limit(5);
      return (data ?? []).find((r: any) => r.client_id === shift.client_id && r.service_type_code === code) ?? null;
    },
  });

  const clockIn = useMutation({
    mutationFn: async () => {
      const gps = await getGPS();
      const { data, error } = await (supabase as any).from("evv_timesheets").insert({
        organization_id: shift.organization_id,
        staff_id: userId,
        client_id: shift.client_id,
        utah_medicaid_provider_id: org?.dhhs_provider_id ?? "PENDING",
        utah_medicaid_member_id: shift.client?.medicaid_id ?? "PENDING",
        service_type_code: code || "RHS",
        gps_in_coordinates: { lat: gps.lat, lng: gps.lng, ...(gps.accuracy !== undefined && { accuracy: gps.accuracy }), advisory: gps.lat === 0 && gps.lng === 0 },
        shift_entry_type: "Client_Profile_Pass",
        status: "Active",
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success(`Clocked in — ${code}`); qc.invalidateQueries({ queryKey: ["evv-active"] }); },
    onError: (e: any) => toast.error(e.message ?? "Clock-in failed"),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!activePunch) return;
      const outIso = new Date().toISOString();
      const gps = await getGPS();
      const { error } = await (supabase as any).from("evv_timesheets").update({
        clock_out_timestamp: outIso,
        gps_out_coordinates: { lat: gps.lat, lng: gps.lng, ...(gps.accuracy !== undefined && { accuracy: gps.accuracy }), advisory: gps.lat === 0 && gps.lng === 0 },
        status: "Pending",
        // Per-entry quarter-hour units (round-to-NEAREST); raw timestamps untouched.
        billed_units: computeEntryUnits((activePunch as any).clock_in_timestamp, outIso),
      }).eq("id", (activePunch as any).id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Clocked out"); qc.invalidateQueries({ queryKey: ["evv-active"] }); },
    onError: (e: any) => toast.error(e.message ?? "Clock-out failed"),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Time clock · {code || "—"}</h2>
          <p className="text-xs text-muted-foreground">
            {isContinuous
              ? "Continuous code: one block punch. 1:1 services (DSI/SEI/ELS) need their own separate punch."
              : "Discrete code: clock in for this service, clock out when finished."}
          </p>
        </div>
        {activePunch ? (
          <Badge className="bg-emerald-600 text-white">On the clock</Badge>
        ) : (
          <Badge variant="outline">Not clocked in</Badge>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        {activePunch ? (
          <Button onClick={() => clockOut.mutate()} disabled={clockOut.isPending} className="flex-1 min-h-[44px]" variant="destructive">
            Clock out
          </Button>
        ) : (
          <Button onClick={() => clockIn.mutate()} disabled={clockIn.isPending || !userId} className="flex-1 min-h-[44px]">
            Clock in to {code || "shift"}
          </Button>
        )}
      </div>
    </section>
  );
}

function RhsOverviewPanel({ shift }: { shift: Shift }) {
  const code = shift.code?.code ?? "RHS";
  const { data } = useQuery({
    queryKey: ["rhs-overview", shift.client_id, code],
    queryFn: async () => {
      const { data: auth } = await supabase
        .from("client_billing_codes")
        .select("annual_unit_authorization, unit_type, service_start_date, service_end_date")
        .eq("client_id", shift.client_id)
        .eq("service_code", code)
        .maybeSingle();
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const periodStart = (auth as any)?.service_start_date ?? yearStart;
      const periodEnd = (auth as any)?.service_end_date ?? new Date(new Date().getFullYear(), 11, 31).toISOString();
      const { data: punches } = await supabase
        .from("evv_timesheets")
        .select("clock_in_timestamp, clock_out_timestamp")
        .eq("client_id", shift.client_id)
        .eq("service_type_code", code)
        .gte("clock_in_timestamp", new Date(periodStart).toISOString())
        .lte("clock_in_timestamp", new Date(periodEnd).toISOString())
        .not("clock_out_timestamp", "is", null);
      const deliveredHours = (punches ?? []).reduce((acc: number, p: any) => {
        const ms = new Date(p.clock_out_timestamp).getTime() - new Date(p.clock_in_timestamp).getTime();
        return acc + ms / 3_600_000;
      }, 0);
      const unitType = (auth as any)?.unit_type ?? "H";
      // Convert authorized units to hours when stored as 15-min units (Q)
      const rawAuth = Number((auth as any)?.annual_unit_authorization ?? 0);
      const authorized = unitType === "Q" ? rawAuth / 4 : rawAuth;
      return { authorized, delivered: deliveredHours, remaining: Math.max(0, authorized - deliveredHours), unit: "hour" };
    },
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-2">RHS overview</h2>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Authorized" value={data?.authorized?.toFixed(1) ?? "—"} unit={data?.unit} />
        <Stat label="Delivered" value={data?.delivered?.toFixed(1) ?? "—"} unit={data?.unit} />
        <Stat label="Remaining" value={data?.remaining?.toFixed(1) ?? "—"} unit={data?.unit} tone={data && data.remaining < 4 ? "warn" : "ok"} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Advisory only · from authorizations vs delivered punches in the current plan period.</p>
    </section>
  );
}

function Stat({ label, value, unit, tone = "ok" }: { label: string; value: string; unit?: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-lg p-2 ${tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-muted/40"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}<span className="text-xs font-normal ml-1">{unit}</span></p>
    </div>
  );
}

function ShiftReportPanel({ shift, userId }: { shift: Shift; userId?: string }) {
  const qc = useQueryClient();
  const { data: existing } = useQuery({
    queryKey: ["shift-report", shift.id],
    queryFn: async () => {
      const { data } = await supabase.from("shift_reports" as any).select("*").eq("scheduled_shift_id", shift.id).maybeSingle();
      return data as any;
    },
  });
  const [narrative, setNarrative] = useState("");
  const [incident, setIncident] = useState("");
  const value = narrative || existing?.narrative || "";

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      const payload: any = {
        organization_id: shift.organization_id,
        scheduled_shift_id: shift.id,
        staff_id: userId,
        client_id: shift.client_id,
        code_id: shift.code_id,
        narrative: narrative || existing?.narrative,
        incidents: incident ? [{ note: incident, at: new Date().toISOString() }] : existing?.incidents ?? [],
        submitted_at: submit ? new Date().toISOString() : existing?.submitted_at ?? null,
      };
      if (existing?.id) {
        const { error } = await (supabase as any).from("shift_reports").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("shift_reports").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_d, submit) => { toast.success(submit ? "Report submitted" : "Draft saved"); qc.invalidateQueries({ queryKey: ["shift-report", shift.id] }); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Shift report</h2>
      <Textarea
        rows={4}
        placeholder="What happened during this shift? Activities, mood, notable events…"
        value={value}
        onChange={(e) => setNarrative(e.target.value)}
        className="text-sm"
      />
      <Input className="mt-2 text-sm" placeholder="Add an incident note (optional)" value={incident} onChange={(e) => setIncident(e.target.value)} />
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>Save draft</Button>
        <Button size="sm" onClick={() => save.mutate(true)} disabled={save.isPending}>Submit with shift</Button>
        {existing?.submitted_at && <span className="ml-auto text-[11px] text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Submitted {new Date(existing.submitted_at).toLocaleString()}</span>}
      </div>
    </section>
  );
}

function MarPanel({ shift, userId }: { shift: Shift; userId?: string }) {
  const qc = useQueryClient();
  const { data: meds } = useQuery({
    queryKey: ["client-meds", shift.client_id],
    queryFn: async () => {
      const { data } = await supabase.from("client_medications").select("id, medication_name, dosage, frequency, route, scheduled_times, is_prn, instructions").eq("client_id", shift.client_id).eq("is_active", true).order("medication_name");
      return (data ?? []) as any[];
    },
  });
  // Unified read: any administration for this client that either was recorded
  // from this shift (source='shift', scheduled_shift_id=shift.id) OR was
  // recorded in the eMAR during the shift window. One record, both surfaces.
  const { data: entries } = useQuery({
    queryKey: ["mar-entries-unified", shift.id, shift.client_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("emar_logs")
        .select("id, medication_id, scheduled_for, scheduled_time_label, status, administered_at, source, scheduled_shift_id, notes, staff_name")
        .eq("client_id", shift.client_id)
        .or(`scheduled_shift_id.eq.${shift.id},and(administered_at.gte.${shift.starts_at},administered_at.lte.${shift.ends_at})`);
      return (data ?? []) as any[];
    },
  });

  // Map the shift-screen's simple statuses to the unified emar_logs status set.
  //   given   → administered
  //   refused → refused
  //   missed  → missed
  //   held    → held
  const record = useMutation({
    mutationFn: async (p: { med: any; status: "given" | "refused" | "missed" | "held"; scheduled_time?: string; notes?: string }) => {
      const statusMap = { given: "administered", refused: "refused", missed: "missed", held: "held" } as const;
      const now = new Date().toISOString();
      const { error } = await (supabase as any).from("emar_logs").insert({
        organization_id: shift.organization_id,
        client_id: shift.client_id,
        medication_id: p.med.id,
        source: "shift",
        scheduled_shift_id: shift.id,
        // scheduled_for is NOT NULL — fall back to the shift start when the row
        // is a PRN / unscheduled pass. Keep the raw HH:MM label for display.
        scheduled_for: shift.starts_at,
        scheduled_time_label: p.scheduled_time ?? null,
        status: statusMap[p.status],
        administered_at: p.status === "given" ? now : null,
        staff_id: userId,
        notes: p.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Marked ${vars.status}`);
      qc.invalidateQueries({ queryKey: ["mar-entries-unified", shift.id, shift.client_id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Record failed"),
  });

  const entryFor = (medId: string, time?: string) =>
    (entries ?? []).find((e) => e.medication_id === medId && (time ? e.scheduled_time_label === time : true));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Pill className="h-4 w-4" /> Medication Administration (MAR)</h2>
      {!meds || meds.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active medications on record for this client.</p>
      ) : (
        <ul className="space-y-2">
          {meds.map((m) => {
            const times = m.scheduled_times?.length ? m.scheduled_times : (m.is_prn ? ["PRN"] : ["—"]);
            return (
              <li key={m.id} className="rounded-md border border-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{m.medication_name} <span className="font-normal text-muted-foreground">{m.dosage}</span></p>
                    <p className="text-[11px] text-muted-foreground">{m.route} · {m.frequency}</p>
                    {m.instructions && <p className="text-[11px] text-muted-foreground">{m.instructions}</p>}
                  </div>
                  {m.is_prn && <Badge variant="outline" className="text-[10px]">PRN</Badge>}
                </div>
                <div className="mt-2 space-y-1">
                  {times.map((t: string) => {
                    const e = entryFor(m.id, m.is_prn ? undefined : t);
                    const stampAt = e?.administered_at ?? e?.scheduled_for;
                    return (
                      <div key={t} className="flex items-center gap-2">
                        <span className="text-[11px] font-mono w-12 shrink-0 text-muted-foreground">{t}</span>
                        {e ? (
                          <Badge className={
                            e.status === "administered" || e.status === "self_administered" ? "bg-emerald-600 text-white" :
                            e.status === "refused" ? "bg-amber-600 text-white" :
                            e.status === "missed" || e.status === "omitted" ? "bg-rose-600 text-white" :
                            e.status === "loa" ? "bg-blue-600 text-white" : "bg-muted"
                          }>
                            {e.status}
                            {stampAt ? ` · ${new Date(stampAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                            {e.source === "emar" ? " · eMAR" : ""}
                          </Badge>
                        ) : (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => record.mutate({ med: m, status: "given", scheduled_time: m.is_prn ? undefined : t })}>Given</Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => record.mutate({ med: m, status: "refused", scheduled_time: m.is_prn ? undefined : t })}>Refused</Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => record.mutate({ med: m, status: "missed", scheduled_time: m.is_prn ? undefined : t })}>Missed</Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}


function CalloutPanel({ shift, userId }: { shift: Shift; userId?: string }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const { data: existing } = useQuery({
    queryKey: ["callout", shift.id],
    queryFn: async () => {
      const { data } = await supabase.from("shift_callouts" as any).select("*").eq("scheduled_shift_id", shift.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data as any;
    },
  });
  const { data: events } = useQuery({
    enabled: !!existing?.id,
    queryKey: ["callout-events", existing?.id],
    queryFn: async () => {
      const { data } = await supabase.from("callout_escalation_events" as any).select("*").eq("callout_id", existing!.id).order("created_at");
      return (data ?? []) as any[];
    },
  });

  const urgency = useMemo<"low" | "normal" | "high" | "critical">(() => {
    const hrs = (new Date(shift.starts_at).getTime() - Date.now()) / 3_600_000;
    if (hrs < 1) return "critical";
    if (hrs < 4) return "high";
    if (hrs < 12) return "normal";
    return "low";
  }, [shift.starts_at]);

  const callOut = useMutation({
    mutationFn: async () => {
      const { data: co, error } = await (supabase as any).from("shift_callouts").insert({
        organization_id: shift.organization_id,
        scheduled_shift_id: shift.id,
        staff_id: userId,
        reason,
        urgency,
        status: "open",
      }).select().single();
      if (error) throw error;
      // Seed initial parallel escalation events (simulated channels — real SMS/voice wires later)
      const seed = [
        { step: 1, channel: "in_app", target_role: "manager", outcome: "sent", detail: "Push + in-app notification fanned out to all on-shift managers." },
        { step: 1, channel: "system", target_role: "qualified_staff", outcome: "sent", detail: "Shift opened to qualified staff in parallel." },
      ];
      for (const e of seed) {
        await (supabase as any).from("callout_escalation_events").insert({ organization_id: shift.organization_id, callout_id: co.id, ...e });
      }
      return co;
    },
    onSuccess: () => { toast.success("Call-out received. Coverage search opened."); setReason(""); qc.invalidateQueries({ queryKey: ["callout", shift.id] }); },
    onError: (e: any) => toast.error(e.message ?? "Call-out failed"),
  });

  const escalate = useMutation({
    mutationFn: async () => {
      if (!existing) return;
      const nextStep = (events?.length ?? 0) + 1;
      const ladder = [
        { channel: "sms", target_role: "manager", detail: "SMS sent to primary manager." },
        { channel: "voice", target_role: "manager", detail: "Automated voice call placed to primary manager." },
        { channel: "sms", target_role: "director", detail: "Escalated to backup manager/director via SMS." },
        { channel: "voice", target_role: "director", detail: "Escalated to director via voice call." },
      ];
      const step = ladder[Math.min(nextStep - 2, ladder.length - 1)];
      const { error } = await (supabase as any).from("callout_escalation_events").insert({
        organization_id: shift.organization_id,
        callout_id: existing.id,
        step: nextStep,
        channel: step.channel,
        target_role: step.target_role,
        outcome: "sent",
        detail: step.detail,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["callout-events", existing?.id] }),
  });

  const acknowledge = useMutation({
    mutationFn: async () => {
      if (!existing) return;
      const { error } = await (supabase as any).from("shift_callouts").update({
        status: "manager_acknowledged",
        manager_acknowledged_at: new Date().toISOString(),
        manager_acknowledged_by: userId,
      }).eq("id", existing.id);
      if (error) throw error;
      await (supabase as any).from("callout_escalation_events").insert({
        organization_id: shift.organization_id,
        callout_id: existing.id,
        step: (events?.length ?? 0) + 1,
        channel: "in_app",
        target_role: "manager",
        target_user_id: userId,
        outcome: "acknowledged",
        detail: "Manager acknowledged call-out.",
      });
    },
    onSuccess: () => { toast.success("Acknowledged"); qc.invalidateQueries({ queryKey: ["callout", shift.id] }); qc.invalidateQueries({ queryKey: ["callout-events", existing?.id] }); },
  });

  const lockCoverage = useMutation({
    mutationFn: async () => {
      if (!existing) return;
      const { error } = await (supabase as any).from("shift_callouts").update({
        status: "coverage_locked",
        coverage_locked_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (error) throw error;
      await (supabase as any).from("callout_escalation_events").insert({
        organization_id: shift.organization_id,
        callout_id: existing.id,
        step: (events?.length ?? 0) + 1,
        channel: "system",
        outcome: "acknowledged",
        detail: "Coverage locked. Call-out closed.",
      });
    },
    onSuccess: () => { toast.success("Coverage locked"); qc.invalidateQueries({ queryKey: ["callout", shift.id] }); },
  });

  if (existing && existing.status !== "cancelled") {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-amber-900">
          <PhoneOff className="h-4 w-4" /> Call-out in progress
          <Badge className="ml-auto" variant={existing.status === "coverage_locked" ? "default" : "secondary"}>{existing.status}</Badge>
        </h2>
        <p className="text-xs text-amber-900 mt-1">Urgency: <strong>{existing.urgency}</strong>{existing.reason ? ` · ${existing.reason}` : ""}</p>
        <ol className="mt-3 space-y-1 text-xs">
          {(events ?? []).map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="font-mono text-muted-foreground">#{e.step}</span>
              <span className="font-semibold uppercase text-[10px]">{e.channel}</span>
              <span>→ {e.target_role ?? "—"}</span>
              <span className="ml-auto">{e.outcome}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          {existing.status === "open" && <Button size="sm" variant="outline" onClick={() => escalate.mutate()}>Escalate next step</Button>}
          {existing.status === "open" && <Button size="sm" onClick={() => acknowledge.mutate()}>Manager acknowledge</Button>}
          {existing.status === "manager_acknowledged" && <Button size="sm" onClick={() => lockCoverage.mutate()}>Lock coverage & close</Button>}
        </div>
        <p className="mt-2 text-[10px] text-amber-900">Closes only when a manager acknowledges AND coverage is locked. Channels are simulated; real SMS/voice wires in when the messaging provider is connected.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Can't make this shift?</h2>
      <p className="text-xs text-muted-foreground mt-1">Calling out opens the shift to qualified staff in parallel and pings managers with an acknowledgment-required escalation ladder. Urgency scales by shift proximity (currently <strong>{urgency}</strong>).</p>
      <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 text-sm" />
      <Button variant="destructive" size="sm" className="mt-2" onClick={() => callOut.mutate()} disabled={callOut.isPending || !userId}>
        Call out
      </Button>
    </section>
  );
}
