import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FileText, Pill, Calendar, ClipboardList, AlertTriangle, Phone, Stethoscope, Box, Flame, Repeat, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { evaluateShiftNote } from "@/lib/ai-coach.functions";
import { saveDailyRecord, saveEmarLog, setAttendance, savePrnForm, saveIncidentReport } from "@/lib/hhs.functions";

export const Route = createFileRoute("/dashboard/hhs-hub/$clientId")({
  head: () => ({ meta: [{ title: "Host Home Client Hub — Care Academy" }] }),
  component: HhsClientHub,
});

interface ClientFull {
  id: string;
  first_name: string;
  last_name: string;
  pcsp_goals: string[] | null;
  physical_address: string | null;
}

function HhsClientHub() {
  const { clientId } = Route.useParams();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const { data: client, isLoading } = useQuery({
    enabled: !!clientId,
    queryKey: ["hhs-client", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, pcsp_goals, physical_address")
        .eq("id", clientId)
        .maybeSingle();
      return data as ClientFull | null;
    },
  });

  const { data: meds = [] } = useQuery({
    enabled: !!clientId,
    queryKey: ["hhs-meds", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("client_medications")
        .select("*")
        .eq("client_id", clientId)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!client || !orgId) return <p className="p-6 text-sm text-muted-foreground">Client unavailable.</p>;

  const fullName = `${client.first_name} ${client.last_name}`.trim();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-3 sm:px-0">
      <Link to="/dashboard" className="inline-flex h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to my caseload
      </Link>

      {/* CLINICAL PROFILE BANNER — persistent */}
      <Card className="border-red-300 bg-red-50/40 dark:bg-red-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            🩺 Clinical Profile · {fullName}
            <Badge className="bg-amber-500">🏡 HHS</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          <div><strong>Medical Concerns / Allergies:</strong> See client chart. Always re-verify before any med pass.</div>
          <div className="text-amber-700"><strong>⚠️ Choking / Swallow Reflex:</strong> Confirm posture upright and crushed-med policy per care plan.</div>
          <div className="flex flex-wrap gap-2 mt-1">
            <Button size="sm" variant="outline" className="h-8">📄 Emergency Medical Authorization</Button>
            <Button size="sm" variant="outline" className="h-8">📄 Advanced Directives</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="note">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1">
          <TabsTrigger value="note" className="h-11 text-xs sm:text-sm"><FileText className="h-4 w-4 mr-1" />Daily Note</TabsTrigger>
          <TabsTrigger value="emar" className="h-11 text-xs sm:text-sm"><Pill className="h-4 w-4 mr-1" />eMAR</TabsTrigger>
          <TabsTrigger value="att" className="h-11 text-xs sm:text-sm"><Calendar className="h-4 w-4 mr-1" />Attendance</TabsTrigger>
          <TabsTrigger value="prn" className="h-11 text-xs sm:text-sm"><ClipboardList className="h-4 w-4 mr-1" />PRN Forms</TabsTrigger>
        </TabsList>

        <TabsContent value="note" className="mt-4">
          <DailyNoteTab orgId={orgId} client={client} />
        </TabsContent>
        <TabsContent value="emar" className="mt-4">
          <EmarTab orgId={orgId} clientId={client.id} meds={meds as Array<Record<string, unknown>>} />
        </TabsContent>
        <TabsContent value="att" className="mt-4">
          <AttendanceTab orgId={orgId} clientId={client.id} />
        </TabsContent>
        <TabsContent value="prn" className="mt-4">
          <PrnFormsTab orgId={orgId} clientId={client.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Daily Note + AI Coach + AI Interlock Gates ============
const INCIDENT_RX = /\b(fell|fall|fainted|seizure|injur(y|ed|ies)|bleed|blood|hospital|ER|emergency|crisis|aggress|hit\s+(?:them|him|her)|self[- ]harm|elop(e|ed|ement)|abuse|neglect)\b/i;
const MEDICAL_RX = /\b(appointment|appt|doctor|dr\.|dentist|dental|clinic|specialist|checkup|check[- ]up|seen by|visited (?:the )?(?:doctor|md|clinic|hospital))\b/i;
const today = () => new Date().toISOString().slice(0, 10);

function DailyNoteTab({ orgId, client }: { orgId: string; client: ClientFull }) {
  const [note, setNote] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [coach, setCoach] = useState<{ status: string; feedback: string } | null>(null);
  const [interlock, setInterlock] = useState<{ kind: "incident" | "medical"; msg: string } | null>(null);
  const evalFn = useServerFn(evaluateShiftNote);
  const saveFn = useServerFn(saveDailyRecord);
  const pcsp = client.pcsp_goals ?? [];

  const charCount = note.trim().length;
  const remaining = Math.max(0, 50 - charCount);
  const meetsMin = charCount >= 50;

  const checkInterlocks = async (): Promise<boolean> => {
    const t = today();
    const hasIncidentLanguage = INCIDENT_RX.test(note);
    const hasMedicalLanguage = MEDICAL_RX.test(note);
    if (hasIncidentLanguage) {
      const { count } = await supabase
        .from("hhs_incident_reports" as never)
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("occurred_at", `${t}T00:00:00Z`);
      if (!count || count === 0) {
        setInterlock({
          kind: "incident",
          msg: "⚠️ AI Compliance Lock: Your daily summary describes a critical event or injury. State regulations mandate an incident intake log. Please complete the Incident Report worksheet in Tab 4 to submit your daily records.",
        });
        return false;
      }
    }
    if (hasMedicalLanguage) {
      const { count } = await supabase
        .from("hhs_medical_logs" as never)
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .gte("appointment_at", `${t}T00:00:00Z`);
      if (!count || count === 0) {
        setInterlock({
          kind: "medical",
          msg: "⚠️ AI Compliance Lock: Your note references a medical / specialist appointment. Please fill out the Medical Appointment Log form in Tab 4 before saving today's daily record.",
        });
        return false;
      }
    }
    return true;
  };

  const checkMut = useMutation({
    mutationFn: async () => evalFn({ data: { narrative: note, goals, clientFirstName: client.first_name } }),
    onSuccess: (r) => setCoach(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const ok = await checkInterlocks();
      if (!ok) throw new Error("AI compliance lock");
      return saveFn({
        data: {
          organizationId: orgId,
          clientId: client.id,
          recordDate: today(),
          narrative: note,
          pcspGoalsAddressed: goals,
          aiStatus: coach?.status ?? null,
          aiFeedback: coach?.feedback ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Daily progress note saved.");
      setNote(""); setGoals([]); setCoach(null);
    },
    onError: (e: Error) => {
      if (e.message !== "AI compliance lock") toast.error(e.message);
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">📝 24-Hour Daily Progress Note</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>PCSP Goals Addressed Today</Label>
          <div className="mt-1 space-y-1">
            {pcsp.length === 0 && <p className="text-xs text-muted-foreground">No PCSP goals on file for this client.</p>}
            {pcsp.map((g) => (
              <label key={g} className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={goals.includes(g)}
                  onCheckedChange={(c) => setGoals(c ? [...goals, g] : goals.filter((x) => x !== g))}
                />
                {g}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Narrative Summary</Label>
          <Textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe support provided, behaviors observed, goal progress, ADLs…" />
          <div className={`mt-1 text-xs ${meetsMin ? "text-green-700" : "text-amber-700"}`}>
            {meetsMin
              ? `✓ Clinical threshold met (${charCount} characters).`
              : `Characters remaining to meet clinical threshold: ${remaining}`}
          </div>
        </div>
        {coach && (
          <div className={`rounded-lg border p-3 text-sm ${coach.status === "Verified" ? "border-green-400 bg-green-50 dark:bg-green-950/30" : "border-amber-400 bg-amber-50 dark:bg-amber-950/30"}`}>
            <strong>{coach.status === "Verified" ? "✓ AI Coach: Verified" : "⚠ AI Coach: Flagged"}</strong>
            <p className="mt-1">{coach.feedback}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => checkMut.mutate()} disabled={!meetsMin || checkMut.isPending}>
            {checkMut.isPending ? "Checking…" : "🤖 Run AI Coach Pre-Screen"}
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={!meetsMin || saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save Daily Note"}
          </Button>
        </div>
      </CardContent>

      <Dialog open={!!interlock} onOpenChange={(o) => !o && setInterlock(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-700">🚨 AI Compliance Lock</DialogTitle>
          </DialogHeader>
          <p className="text-sm">{interlock?.msg}</p>
          <DialogFooter>
            <Button onClick={() => setInterlock(null)}>Open PRN Forms (Tab 4)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============ eMAR ============
function EmarTab({ orgId, clientId, meds }: { orgId: string; clientId: string; meds: Array<Record<string, unknown>> }) {
  const { user } = useAuth();
  const saveFn = useServerFn(saveEmarLog);
  const [active, setActive] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<"Passed" | "Refused" | "Missed" | "Held">("Passed");
  const [prnReason, setPrnReason] = useState("");
  const [pillCount, setPillCount] = useState("");
  const [pillVerified, setPillVerified] = useState(false);

  const isPrn = useMemo(() => /prn/i.test(String(active?.frequency ?? "")) || /prn/i.test(String(active?.instructions ?? "")), [active]);
  const isControlled = useMemo(() => /schedule\s*(ii|iii|iv|2|3|4)/i.test(String(active?.instructions ?? "")), [active]);

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!active) return;
      return saveFn({
        data: {
          organizationId: orgId,
          clientId,
          medicationId: String(active.id),
          medicationName: String(active.medication_name),
          dosage: (active.dosage as string) ?? null,
          route: (active.route as string) ?? null,
          scheduledFor: new Date().toISOString(),
          status,
          isPrn,
          prnReason: isPrn ? prnReason : null,
          isControlled,
          pillCountVerified: isControlled ? pillVerified : null,
          pillCountValue: isControlled && pillCount ? parseInt(pillCount, 10) : null,
          signatureAttestation: user?.email ?? "caregiver",
          staffName: user?.user_metadata?.full_name ?? user?.email ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Med ${status}.`);
      setActive(null); setPrnReason(""); setPillCount(""); setPillVerified(false); setStatus("Passed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">💊 Today's eMAR</CardTitle>
        <Button size="sm" variant="destructive">⚠️ Report Medication Error</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {meds.length === 0 && <p className="text-sm text-muted-foreground">No active medications on file.</p>}
        {meds.map((m) => (
          <div key={String(m.id)} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{String(m.medication_name)} <span className="text-xs text-muted-foreground">{String(m.dosage ?? "")}</span></div>
                <div className="text-xs text-muted-foreground">Route: {String(m.route ?? "—")} · {String(m.frequency ?? "")}</div>
                {m.instructions ? <div className="text-xs">{String(m.instructions)}</div> : null}
                <div className="mt-1 rounded bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-300 px-2 py-1 text-[11px] text-yellow-900 dark:text-yellow-200">
                  ⚠️ Side-effects: monitor for drowsiness, swallowing/choking risk. Confirm upright posture.
                </div>
              </div>
              <Button size="sm" onClick={() => setActive(m)}>Record Pass</Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{String(active?.medication_name ?? "")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Passed">Passed</SelectItem>
                  <SelectItem value="Refused">Refused</SelectItem>
                  <SelectItem value="Missed">Missed</SelectItem>
                  <SelectItem value="Held">Held</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isPrn && (
              <div>
                <Label>Reason for PRN Administration *</Label>
                <Textarea rows={2} value={prnReason} onChange={(e) => setPrnReason(e.target.value)} />
              </div>
            )}
            {isControlled && status === "Passed" && (
              <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 space-y-2">
                <div className="text-sm font-semibold text-red-700">🔒 Schedule II–IV Controlled — Pill Count Required</div>
                <Input type="number" placeholder="Pills remaining after dose" value={pillCount} onChange={(e) => setPillCount(e.target.value)} />
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={pillVerified} onCheckedChange={(c) => setPillVerified(!!c)} />
                  I physically counted and verified the remaining pill quantity.
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>Cancel</Button>
            <Button
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending || (isPrn && !prnReason) || (isControlled && status === "Passed" && !pillVerified)}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============ Attendance ============
function AttendanceTab({ orgId, clientId }: { orgId: string; clientId: string }) {
  const fn = useServerFn(setAttendance);
  const [presence, setPresence] = useState<"Present" | "Away">("Present");
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: async () =>
      fn({
        data: {
          organizationId: orgId,
          clientId,
          recordDate: new Date().toISOString().slice(0, 10),
          presenceStatus: presence,
          awayReason: presence === "Away" ? reason : null,
        },
      }),
    onSuccess: () => toast.success("Today's billing presence recorded."),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">📅 State Billing Status for Today</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <RadioGroup value={presence} onValueChange={(v) => setPresence(v as "Present" | "Away")} className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="Present" /> 🟢 Present in Home (billable overnight)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="Away" /> 🟡 Away / Unbillable Leave (hospitalization, family respite, etc.)
          </label>
        </RadioGroup>
        {presence === "Away" && (
          <div>
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Hospitalization, family visit…" />
          </div>
        )}
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save Today's Status</Button>
      </CardContent>
    </Card>
  );
}

// ============ PRN Forms ============
type PrnKind = "medical" | "summary" | "inventory" | "drill" | "transfer" | "incident";

function PrnFormsTab({ orgId, clientId }: { orgId: string; clientId: string }) {
  const [open, setOpen] = useState<PrnKind | null>(null);
  const items: { kind: PrnKind; icon: React.ReactNode; title: string; desc: string }[] = [
    { kind: "medical", icon: <Stethoscope className="h-5 w-5" />, title: "🩺 Medical & Specialist Appointment Log", desc: "Record an appointment visit and orders." },
    { kind: "summary", icon: <BookOpen className="h-5 w-5" />, title: "📈 Comprehensive Monthly Review Summary", desc: "Monthly PCSP narrative and community outings." },
    { kind: "inventory", icon: <Box className="h-5 w-5" />, title: "💎 $50+ Valuables Inventory", desc: "Register or remove client high-value belongings." },
    { kind: "drill", icon: <Flame className="h-5 w-5" />, title: "🔥 Quarterly Evacuation Drill Record", desc: "Log fire / earthquake / weather drills." },
    { kind: "transfer", icon: <Repeat className="h-5 w-5" />, title: "🔄 Cross-Agency Transfer Log", desc: "Communication log to school, day program, respite." },
    { kind: "incident", icon: <AlertTriangle className="h-5 w-5 text-destructive" />, title: "🚨 Form C — Critical Incident Report", desc: "INTERNAL intake for admin review (NOT direct UPI)." },
  ];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">📋 PRN / As-Needed Forms</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((it) => (
          <button
            key={it.kind}
            onClick={() => setOpen(it.kind)}
            className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 transition"
          >
            <div className="mt-0.5">{it.icon}</div>
            <div className="flex-1">
              <div className="font-medium text-sm">{it.title}</div>
              <div className="text-xs text-muted-foreground">{it.desc}</div>
            </div>
          </button>
        ))}
      </CardContent>

      {open && open !== "incident" && (
        <PrnFormDialog kind={open} orgId={orgId} clientId={clientId} onClose={() => setOpen(null)} />
      )}
      {open === "incident" && (
        <IncidentFormDialog orgId={orgId} clientId={clientId} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}

function PrnFormDialog({ kind, orgId, clientId, onClose }: { kind: Exclude<PrnKind, "incident">; orgId: string; clientId: string; onClose: () => void }) {
  const fn = useServerFn(savePrnForm);
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (kind === "medical") {
        payload.appointment_at = new Date(form.appointment_at || new Date().toISOString()).toISOString();
        payload.facility_name = form.facility_name ?? "";
        payload.reason = form.reason ?? "";
        payload.orders_changes = form.orders_changes ?? null;
        payload.follow_up_date = form.follow_up_date || null;
      } else if (kind === "summary") {
        payload.target_month = (form.target_month || new Date().toISOString().slice(0, 7)) + "-01";
        payload.pcsp_progress_narrative = form.pcsp_progress_narrative ?? "";
        payload.community_outings = form.community_outings
          ? form.community_outings.split("\n").filter(Boolean).map((t) => ({ activity: t }))
          : [];
      } else if (kind === "inventory") {
        payload.asset_description = form.asset_description ?? "";
        payload.estimated_value = parseFloat(form.estimated_value || "0");
        payload.added_on = form.added_on || new Date().toISOString().slice(0, 10);
      } else if (kind === "drill") {
        payload.drill_executed_at = new Date(form.drill_executed_at || new Date().toISOString()).toISOString();
        payload.simulation_type = form.simulation_type || "Fire";
        payload.evacuation_duration_seconds = parseInt(form.evacuation_duration_seconds || "0", 10);
      } else if (kind === "transfer") {
        payload.receiving_party = form.receiving_party ?? "";
        payload.party_type = form.party_type || "School";
        payload.communication_summary = form.communication_summary ?? "";
      }
      return fn({ data: { kind, organizationId: orgId, clientId, payload } });
    },
    onSuccess: () => {
      toast.success("Form saved.");
      qc.invalidateQueries({ queryKey: ["hhs-prn"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="capitalize">{kind} form</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {kind === "medical" && (
            <>
              <div><Label>Appointment Date/Time</Label><Input type="datetime-local" onChange={(e) => set("appointment_at", e.target.value)} /></div>
              <div><Label>Provider / Facility</Label><Input onChange={(e) => set("facility_name", e.target.value)} /></div>
              <div><Label>Reason for Visit</Label><Input onChange={(e) => set("reason", e.target.value)} /></div>
              <div><Label>Physician Orders / Care Plan Changes</Label><Textarea rows={3} onChange={(e) => set("orders_changes", e.target.value)} /></div>
              <div><Label>Follow-up Date</Label><Input type="date" onChange={(e) => set("follow_up_date", e.target.value)} /></div>
            </>
          )}
          {kind === "summary" && (
            <>
              <div><Label>Target Month</Label><Input type="month" onChange={(e) => set("target_month", e.target.value)} /></div>
              <div><Label>PCSP Progress Narrative</Label><Textarea rows={5} onChange={(e) => set("pcsp_progress_narrative", e.target.value)} /></div>
              <div><Label>Community Outings (one per line)</Label><Textarea rows={3} onChange={(e) => set("community_outings", e.target.value)} /></div>
            </>
          )}
          {kind === "inventory" && (
            <>
              <div><Label>Asset Description</Label><Input onChange={(e) => set("asset_description", e.target.value)} /></div>
              <div><Label>Estimated Value (USD)</Label><Input type="number" step="0.01" onChange={(e) => set("estimated_value", e.target.value)} /></div>
              <div><Label>Date Added</Label><Input type="date" onChange={(e) => set("added_on", e.target.value)} /></div>
            </>
          )}
          {kind === "drill" && (
            <>
              <div><Label>Drill Date/Time</Label><Input type="datetime-local" onChange={(e) => set("drill_executed_at", e.target.value)} /></div>
              <div>
                <Label>Simulation Type</Label>
                <Select onValueChange={(v) => set("simulation_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fire">Fire</SelectItem>
                    <SelectItem value="Earthquake">Earthquake</SelectItem>
                    <SelectItem value="Severe Weather">Severe Weather</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Total Evacuation Duration (seconds)</Label><Input type="number" onChange={(e) => set("evacuation_duration_seconds", e.target.value)} /></div>
            </>
          )}
          {kind === "transfer" && (
            <>
              <div><Label>Receiving Party Name</Label><Input onChange={(e) => set("receiving_party", e.target.value)} /></div>
              <div>
                <Label>Party Type</Label>
                <Select onValueChange={(v) => set("party_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="School">School</SelectItem>
                    <SelectItem value="Day Program">Day Program</SelectItem>
                    <SelectItem value="Respite">Respite</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Communication Summary</Label><Textarea rows={4} onChange={(e) => set("communication_summary", e.target.value)} /></div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentFormDialog({ orgId, clientId, onClose }: { orgId: string; clientId: string; onClose: () => void }) {
  const fn = useServerFn(saveIncidentReport);
  const [cats, setCats] = useState<string[]>([]);
  const [desc, setDesc] = useState("");
  const [protective, setProtective] = useState("");
  const [method, setMethod] = useState("Telephone");
  const [contactAt, setContactAt] = useState("");
  const [response, setResponse] = useState("");

  const trigger = cats.some((c) => ["Abuse", "Neglect", "Exploitation", "Maltreatment"].includes(c));

  const mut = useMutation({
    mutationFn: async () =>
      fn({
        data: {
          organizationId: orgId,
          clientId,
          occurredAt: new Date().toISOString(),
          incidentCategories: cats,
          description: desc,
          guardianContactMethod: method,
          guardianContactAt: contactAt ? new Date(contactAt).toISOString() : null,
          guardianResponse: response,
          protectiveActions: trigger ? protective : null,
        },
      }),
    onSuccess: () => {
      toast.success("Incident filed for admin review.");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = ["Injury", "Behavior", "Property Damage", "Medication Error", "Abuse", "Neglect", "Exploitation", "Maltreatment"];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">🚨 Form C — Critical Incident Report</DialogTitle>
          <p className="text-xs text-amber-700">INTERNAL ASSISTANCE INTAKE for administration review. NOT a direct UPI state submission.</p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Incident Categories</Label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {categories.map((c) => (
                <label key={c} className="flex items-center gap-1 text-xs">
                  <Checkbox checked={cats.includes(c)} onCheckedChange={(v) => setCats(v ? [...cats, c] : cats.filter((x) => x !== c))} />
                  {c}
                </label>
              ))}
            </div>
          </div>
          <div><Label>Incident Description</Label><Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>

          {trigger && (
            <div className="rounded border border-red-400 bg-red-50 dark:bg-red-950/30 p-3">
              <Label className="text-red-700">⚠️ Immediate Protective Actions Taken to Keep Client Safe *</Label>
              <Textarea rows={3} value={protective} onChange={(e) => setProtective(e.target.value)} />
            </div>
          )}

          <div className="rounded border bg-muted/30 p-3 space-y-2">
            <div className="text-sm font-semibold flex items-center gap-1"><Phone className="h-4 w-4" />Guardian Notification</div>
            <div>
              <Label>Contact Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Telephone">Telephone</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="Face-to-Face">Face-to-Face</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Contact Date/Time</Label><Input type="datetime-local" value={contactAt} onChange={(e) => setContactAt(e.target.value)} /></div>
            <div><Label>Guardian Response Summary</Label><Textarea rows={2} value={response} onChange={(e) => setResponse(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !desc || (trigger && !protective)}>Submit for Admin Review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
