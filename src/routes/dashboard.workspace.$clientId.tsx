import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCaseload } from "@/hooks/use-caseload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, User, MapPin, Phone, Target, Info, Clock, ClipboardList,
  AlertOctagon, Stethoscope, Receipt, Eraser, FileSignature, Loader2, CheckCircle2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { EvvShiftControl } from "@/components/evv-shift-control";
import { jobCodeLabel } from "@/lib/job-codes";

export const Route = createFileRoute("/dashboard/workspace/$clientId")({
  head: () => ({ meta: [{ title: "Client Workspace — Care Academy" }] }),
  component: ClientWorkspace,
});

const HOURLY_CODES = ["DSI", "DSG", "SLN", "SLH", "SEI", "RHS"];

function ClientWorkspace() {
  const { clientId } = Route.useParams();
  const { data: caseload, isLoading } = useCaseload();
  const navigate = useNavigate();

  const client = useMemo(
    () => (caseload ?? []).find((c) => c.id === clientId) ?? null,
    [caseload, clientId],
  );

  // Security guard: if not in caseload, deny access.
  useEffect(() => {
    if (!isLoading && caseload && !client) {
      toast.error("You are not assigned to this individual.");
      navigate({ to: "/dashboard" });
    }
  }, [isLoading, caseload, client, navigate]);

  if (isLoading || !client) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  const codes = Array.isArray(client.job_code) ? client.job_code : [];
  const hasHHS = codes.includes("HHS");
  const hasHourly = codes.some((c) => HOURLY_CODES.includes(c));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to my caseload
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <User className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {client.first_name} {client.last_name}
            </h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {codes.length ? (
                codes.map((code) => (
                  <Badge key={code} variant="outline" className="font-mono text-[10px]">
                    {code}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No billing codes on file</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="info">
            <Info className="mr-1.5 h-3.5 w-3.5" /> Info
          </TabsTrigger>
          <TabsTrigger value="service">
            <Clock className="mr-1.5 h-3.5 w-3.5" /> Service Tracking
          </TabsTrigger>
          <TabsTrigger value="reporting">
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Reporting
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-5">
          <InfoTab client={client} />
        </TabsContent>

        <TabsContent value="service" className="mt-5">
          <ServiceTrackingTab
            clientId={client.id}
            clientName={`${client.first_name} ${client.last_name}`}
            pcspGoals={client.pcsp_goals ?? []}
            hasHHS={hasHHS}
            hasHourly={hasHourly}
          />
        </TabsContent>

        <TabsContent value="reporting" className="mt-5">
          <ReportingTab clientId={client.id} clientName={`${client.first_name} ${client.last_name}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------------------- INFO TAB ----------------------------- */

function InfoTab({ client }: { client: { first_name: string; last_name: string; medicaid_id: string | null; physical_address: string | null; pcsp_goals: string[]; job_code: string[] | null; home_latitude: number | null; home_longitude: number | null } }) {
  const codes = client.job_code ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Demographics</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Full name" value={`${client.first_name} ${client.last_name}`} />
          <Row label="Medicaid ID" value={client.medicaid_id ?? "—"} mono />
          <Row label="Address" value={client.physical_address ?? "—"} icon={MapPin} />
          <Row
            label="GPS"
            value={
              client.home_latitude != null && client.home_longitude != null
                ? `${client.home_latitude.toFixed(5)}, ${client.home_longitude.toFixed(5)}`
                : "—"
            }
            mono
          />
        </dl>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Authorized Billing Codes</h3>
        {codes.length ? (
          <ul className="space-y-1.5">
            {codes.map((code) => (
              <li key={code} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="font-mono">{code}</Badge>
                <span className="text-muted-foreground">{jobCodeLabel(code).replace(/^[A-Z]+ — /, "")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No billing codes on file.</p>
        )}
        <h3 className="mt-5 mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Target className="h-3.5 w-3.5" /> Active PCSP Goals
        </h3>
        {client.pcsp_goals?.length ? (
          <ul className="space-y-1.5">
            {client.pcsp_goals.map((g) => (
              <li key={g} className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm">{g}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No PCSP goals recorded.</p>
        )}
      </Card>

      <Card className="p-5 md:col-span-2">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Phone className="h-3.5 w-3.5" /> Emergency Contacts
        </h3>
        <p className="text-sm text-muted-foreground">Coordinate with an Administrator to update emergency contact phone numbers on file.</p>
      </Card>
    </div>
  );
}

function Row({ label, value, icon: Icon, mono }: { label: string; value: string; icon?: typeof MapPin; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-baseline gap-3">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono" : ""} flex items-center gap-1.5`}>
        {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
        {value}
      </dd>
    </div>
  );
}

/* --------------------- SERVICE TRACKING TAB --------------------- */

function ServiceTrackingTab({
  clientId, clientName, pcspGoals, hasHHS, hasHourly,
}: {
  clientId: string; clientName: string; pcspGoals: string[]; hasHHS: boolean; hasHourly: boolean;
}) {
  if (!hasHHS && !hasHourly) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No service tracking enabled — this individual has no authorized billing codes on file.
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {hasHourly && (
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-5 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="h-3.5 w-3.5" /> Hourly Time Clock
            </h3>
            <p className="text-xs text-muted-foreground">
              Real-time stopwatch with 7/8-minute payroll rounding applied on clock-out.
            </p>
          </div>
          <div className="p-5">
            <EvvShiftControl />
          </div>
        </Card>
      )}
      {hasHHS && (
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-5 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <FileSignature className="h-3.5 w-3.5" /> Host Home Daily Compliance Journal
            </h3>
            <p className="text-xs text-muted-foreground">
              Flat-rate HHS daily summary — PCSP goals + narrative + signature.
            </p>
          </div>
          <div className="p-5">
            <HhsJournalForm clientId={clientId} clientName={clientName} pcspGoals={pcspGoals} />
          </div>
        </Card>
      )}
    </div>
  );
}

const MIN_NARRATIVE = 50;

function HhsJournalForm({ clientId, clientName, pcspGoals }: { clientId: string; clientName: string; pcspGoals: string[] }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [goals, setGoals] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSignatureRef = useRef(false);

  const remaining = Math.max(0, MIN_NARRATIVE - narrative.trim().length);
  const canSubmit =
    goals.length > 0 && narrative.trim().length >= MIN_NARRATIVE && hasSignatureRef.current && !submitting;

  function toggle(g: string) {
    setGoals((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]));
  }
  function clearCanvas() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    hasSignatureRef.current = false;
  }
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSignatureRef.current = true;
  }
  function up() { drawingRef.current = false; }

  useEffect(() => { setTimeout(clearCanvas, 0); }, []);

  async function submit() {
    if (!user || !org || !canSubmit) return;
    setSubmitting(true);
    try {
      const sig = canvasRef.current?.toDataURL("image/png") ?? null;
      const { error } = await supabase.from("daily_logs").insert({
        organization_id: org.organization_id,
        user_id: user.id,
        client_id: clientId,
        pcsp_goals_addressed: goals,
        narrative: narrative.trim(),
        signature_data_url: sig,
        status: "pending_approval",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (error) throw error;
      toast.success(`Daily log submitted for ${clientName}`);
      setGoals([]);
      setNarrative("");
      clearCanvas();
      qc.invalidateQueries({ queryKey: ["client-timeline"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          PCSP goals addressed today
        </Label>
        {pcspGoals.length ? (
          <div className="flex flex-wrap gap-2">
            {pcspGoals.map((g) => {
              const on = goals.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggle(g)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition active:scale-[0.97] ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary"
                  }`}
                >
                  {on ? "✓ " : ""}{g}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            No PCSP goals on file. Ask an Admin to add them.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="hhs-narr" className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Daily Summary Narrative
        </Label>
        <Textarea
          id="hhs-narr"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={5}
          placeholder="Describe today's care, activities, mood, meals, incidents, and goal progress…"
          className="resize-none"
        />
        <p className={`mt-1 text-[11px] ${remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}>
          {remaining > 0 ? `${remaining} more required` : "✓ Minimum met"}
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Staff Signature</Label>
          <Button type="button" variant="ghost" size="sm" onClick={clearCanvas} className="h-7 text-xs">
            <Eraser className="mr-1 h-3 w-3" /> Clear
          </Button>
        </div>
        <canvas
          ref={canvasRef}
          width={600}
          height={140}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="w-full touch-none rounded-lg border-2 border-dashed border-border bg-white"
        />
      </div>

      <Button onClick={submit} disabled={!canSubmit} className="w-full">
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        Submit daily log
      </Button>
    </div>
  );
}

/* ----------------------------- REPORTING TAB ----------------------------- */

type FormType = "incident_report" | "medical_summary" | "receipt_upload";

function ReportingTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [activeForm, setActiveForm] = useState<FormType | null>(null);

  const cards: { type: FormType; title: string; desc: string; icon: typeof AlertOctagon; tone: string }[] = [
    { type: "incident_report", title: "🚨 Incident Report", desc: "Document a behavioral or safety incident with severity & response.", icon: AlertOctagon, tone: "border-red-200 hover:border-red-400" },
    { type: "medical_summary", title: "🩺 Medical Appointment Summary", desc: "Capture provider notes, prescriptions, and follow-up steps.", icon: Stethoscope, tone: "border-blue-200 hover:border-blue-400" },
    { type: "receipt_upload", title: "📸 Receipt Upload", desc: "Attach a receipt photo with vendor, amount, and category.", icon: Receipt, tone: "border-amber-200 hover:border-amber-400" },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.type}
              onClick={() => setActiveForm(c.type)}
              className={`group rounded-xl border-2 bg-card p-5 text-left shadow-sm transition hover:shadow-md ${c.tone}`}
            >
              <Icon className="mb-2 h-6 w-6 text-foreground/70 transition group-hover:scale-110" />
              <p className="font-semibold">{c.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
            </button>
          );
        })}
      </div>
      <FormDialog
        type={activeForm}
        clientId={clientId}
        clientName={clientName}
        onClose={() => setActiveForm(null)}
      />
    </>
  );
}

function FormDialog({
  type, clientId, clientName, onClose,
}: { type: FormType | null; clientId: string; clientName: string; onClose: () => void }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [narrative, setNarrative] = useState("");
  // Type-specific
  const [severity, setSeverity] = useState("low");
  const [provider, setProvider] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));

  useEffect(() => {
    if (type) {
      setTitle(""); setNarrative(""); setSeverity("low"); setProvider("");
      setVendor(""); setAmount(""); setFile(null);
      setOccurredAt(new Date().toISOString().slice(0, 16));
    }
  }, [type]);

  const headings: Record<FormType, string> = {
    incident_report: "🚨 Incident Report",
    medical_summary: "🩺 Medical Appointment Summary",
    receipt_upload: "📸 Receipt Upload",
  };

  async function uploadAttachment(): Promise<string | null> {
    if (!file || !user) return null;
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("training-assets").upload(path, file);
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data: pub } = supabase.storage.from("training-assets").getPublicUrl(path);
    return pub.publicUrl;
  }

  async function submit() {
    if (!user || !org || !type) return;
    if (!title.trim() || !narrative.trim()) {
      toast.error("Title and details are required");
      return;
    }
    setSubmitting(true);
    try {
      const attachmentUrl = file ? await uploadAttachment() : null;
      const payload: Record<string, unknown> = {};
      if (type === "incident_report") payload.severity = severity;
      if (type === "medical_summary") payload.provider = provider;
      if (type === "receipt_upload") {
        payload.vendor = vendor;
        payload.amount = parseFloat(amount) || 0;
      }
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("submitted_forms" as any)
        .insert({
          organization_id: org.organization_id,
          user_id: user.id,
          client_id: clientId,
          form_type: type,
          title: title.trim(),
          narrative: narrative.trim(),
          attachment_url: attachmentUrl,
          payload,
          occurred_at: new Date(occurredAt).toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (error) throw error;
      toast.success(`Submitted to ${clientName}'s record`);
      qc.invalidateQueries({ queryKey: ["client-timeline"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{type ? headings[type] : ""}</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="title">Title / summary</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="when">When did this occur?</Label>
            <Input id="when" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          {type === "incident_report" && (
            <div className="grid gap-1.5">
              <Label htmlFor="sev">Severity</Label>
              <select id="sev" value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          )}
          {type === "medical_summary" && (
            <div className="grid gap-1.5">
              <Label htmlFor="prov">Provider / clinic</Label>
              <Input id="prov" value={provider} onChange={(e) => setProvider(e.target.value)} />
            </div>
          )}
          {type === "receipt_upload" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="vendor">Vendor</Label>
                <Input id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="amt">Amount ($)</Label>
                <Input id="amt" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="narr">Details / narrative</Label>
            <Textarea id="narr" value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={4} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="file" className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Attachment (optional)
            </Label>
            <Input
              id="file"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
