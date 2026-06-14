import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CalendarCheck2, AlertTriangle, Plus, Trash2, Download, ShieldCheck,
  CheckCircle2, ClipboardCheck, Home as HomeIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ALL_SECTIONS, ALL_ITEM_CODES, statusLabel,
  type ChecklistAnswers, type ChecklistStatus,
} from "@/lib/host-home-cert-items";
import {
  createHostHomeCertification, setHostHomeCertificatePdfPath,
  resolveHostHomeCertConcern, HOST_HOME_CERT_ATTESTATION_TEXT,
} from "@/lib/host-home-certifications.functions";
import { renderCertificatePdf } from "@/lib/host-home-certificate-pdf";

// ─── Types ──────────────────────────────────────────────
type CertRow = {
  id: string;
  client_id: string;
  hhp_cue_card_id: string | null;
  cert_type: "initial" | "annual";
  inspection_date: string;
  inspector_name: string;
  host_home_address: string;
  determination: "certified" | "certified_with_corrections" | "not_certified";
  signed_at: string;
  next_due_date: string;
  certificate_pdf_path: string | null;
  signature_name: string;
  signature_title: string;
};
type ConcernRow = {
  id: string;
  certification_id: string;
  finding: string;
  corrective_action: string;
  target_date: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
};
type HhsClient = { id: string; first_name: string; last_name: string };

// ─── Panel rendered inside the host detail dialog ────────
export function HostCertificationPanel({
  orgId,
  hostCardId,
  hostName,
  defaultAddress,
}: {
  orgId: string;
  hostCardId: string;
  hostName: string;
  defaultAddress: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const certsQ = useQuery({
    queryKey: ["host-hhc", orgId, hostCardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_home_certifications" as never)
        .select("id, client_id, hhp_cue_card_id, cert_type, inspection_date, inspector_name, host_home_address, determination, signed_at, next_due_date, certificate_pdf_path, signature_name, signature_title")
        .eq("organization_id", orgId)
        .eq("hhp_cue_card_id", hostCardId)
        .order("inspection_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CertRow[];
    },
  });

  const concernsQ = useQuery({
    enabled: (certsQ.data?.length ?? 0) > 0,
    queryKey: ["host-hhc-concerns", orgId, hostCardId, (certsQ.data ?? []).map((c) => c.id).join(",")],
    queryFn: async () => {
      const ids = (certsQ.data ?? []).map((c) => c.id);
      if (ids.length === 0) return [] as ConcernRow[];
      const { data, error } = await supabase
        .from("host_home_cert_concerns" as never)
        .select("id, certification_id, finding, corrective_action, target_date, resolved_at, resolution_notes")
        .in("certification_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as ConcernRow[];
    },
  });

  // Pull HHS client names so we can label history rows.
  const clientIds = Array.from(new Set((certsQ.data ?? []).map((c) => c.client_id)));
  const clientNamesQ = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["host-hhc-client-names", orgId, clientIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .in("id", clientIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const c of (data ?? []) as HhsClient[]) {
        map[c.id] = `${c.first_name} ${c.last_name}`;
      }
      return map;
    },
  });

  const latest = certsQ.data?.[0];
  const status = useMemo(() => {
    if (!latest) return { label: "Never certified", tone: "rose" as const };
    const due = new Date(`${latest.next_due_date}T23:59:59`);
    const ms = due.getTime() - Date.now();
    const days = Math.round(ms / 86_400_000);
    if (ms < 0) return { label: `Overdue by ${Math.abs(days)}d`, tone: "rose" as const };
    if (days <= 30) return { label: `Due in ${days}d`, tone: "amber" as const };
    return { label: `Certified through ${latest.next_due_date}`, tone: "emerald" as const };
  }, [latest]);

  const toneClasses =
    status.tone === "rose" ? "bg-rose-100 text-rose-800 border-rose-300"
    : status.tone === "amber" ? "bg-amber-100 text-amber-800 border-amber-300"
    : "bg-emerald-100 text-emerald-800 border-emerald-300";

  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-3">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HomeIcon className="h-4 w-4 text-[#137182]" />
          Host home certification
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClasses}`}>
            <ShieldCheck className="h-3 w-3" /> {status.label}
          </span>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> {latest ? "Renew" : "Certify host"}
          </Button>
        </div>
      </header>

      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Certification history
        </div>
        {certsQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (certsQ.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">No certifications on file for this host yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border">
            {(certsQ.data ?? []).map((c) => (
              <CertHistoryRow
                key={c.id}
                cert={c}
                clientName={(clientNamesQ.data ?? {})[c.client_id] ?? "—"}
                concerns={(concernsQ.data ?? []).filter((x) => x.certification_id === c.id)}
                orgId={orgId}
                onChanged={() => qc.invalidateQueries({ queryKey: ["host-hhc"] })}
              />
            ))}
          </ul>
        )}
      </div>

      <CertificationFormDialog
        open={open}
        onOpenChange={setOpen}
        orgId={orgId}
        hostCardId={hostCardId}
        hostName={hostName}
        defaultAddress={defaultAddress}
        hasPriorCert={(certsQ.data?.length ?? 0) > 0}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["host-hhc"] });
          qc.invalidateQueries({ queryKey: ["hhp-cue-cards"] });
          qc.invalidateQueries({ queryKey: ["hhp-cue-card"] });
          qc.invalidateQueries({ queryKey: ["deadlines"] });
        }}
      />
    </section>
  );
}

// Small kanban-card badge.
export function HostCertBadge({ orgId, hostCardId }: { orgId: string; hostCardId: string }) {
  const q = useQuery({
    queryKey: ["host-hhc-latest", orgId, hostCardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_home_certifications" as never)
        .select("next_due_date")
        .eq("organization_id", orgId)
        .eq("hhp_cue_card_id", hostCardId)
        .order("inspection_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{ next_due_date: string }>;
      return rows[0]?.next_due_date ?? null;
    },
  });
  if (q.isLoading) return null;
  if (!q.data) return <Badge variant="destructive" className="text-[10px]">No cert</Badge>;
  const due = new Date(`${q.data}T23:59:59`);
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <Badge variant="destructive" className="text-[10px]">Cert overdue</Badge>;
  if (days <= 30) return <Badge className="bg-amber-500 text-[10px] hover:bg-amber-500">Cert due {days}d</Badge>;
  return <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">Cert ✓</Badge>;
}

function determinationBadge(d: CertRow["determination"]) {
  if (d === "certified") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Certified</Badge>;
  if (d === "certified_with_corrections") return <Badge className="bg-amber-500 hover:bg-amber-500">Cert. w/ corrections</Badge>;
  return <Badge variant="destructive">Not certified</Badge>;
}

function CertHistoryRow({
  cert, clientName, concerns, orgId, onChanged,
}: {
  cert: CertRow;
  clientName: string;
  concerns: ConcernRow[];
  orgId: string;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const download = async () => {
    if (!cert.certificate_pdf_path) { toast.error("No PDF stored for this certification."); return; }
    const { data, error } = await supabase.storage
      .from("host-home-certificates")
      .createSignedUrl(cert.certificate_pdf_path, 60);
    if (error || !data?.signedUrl) { toast.error(error?.message ?? "Could not generate download link."); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <li className="px-3 py-2 text-xs">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {format(new Date(cert.inspection_date), "MMM d, yyyy")}
            <span className="text-muted-foreground">· {cert.cert_type === "initial" ? "Initial" : "Annual"}</span>
            {determinationBadge(cert.determination)}
          </div>
          <div className="mt-0.5 text-muted-foreground">
            Person: {clientName} · Inspector: {cert.inspector_name} · Next due {cert.next_due_date}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {concerns.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {concerns.length} concern{concerns.length === 1 ? "" : "s"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={download}>
            <Download className="mr-1 h-3 w-3" /> PDF
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2 rounded-md bg-muted/30 p-2">
          {concerns.map((c) => (
            <ConcernRowEditor key={c.id} concern={c} orgId={orgId} onChanged={onChanged} />
          ))}
        </div>
      )}
    </li>
  );
}

function ConcernRowEditor({
  concern, orgId, onChanged,
}: {
  concern: ConcernRow;
  orgId: string;
  onChanged: () => void;
}) {
  const [resolvedAt, setResolvedAt] = useState(concern.resolved_at ?? "");
  const [notes, setNotes] = useState(concern.resolution_notes ?? "");
  const resolveFn = useServerFn(resolveHostHomeCertConcern);
  const m = useMutation({
    mutationFn: async () => resolveFn({
      data: {
        organizationId: orgId,
        concernId: concern.id,
        resolved_at: resolvedAt || new Date().toISOString().slice(0, 10),
        resolution_notes: notes || undefined,
      },
    }),
    onSuccess: () => { toast.success("Concern updated."); onChanged(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="rounded border bg-background p-2">
      <div className="font-medium">{concern.finding}</div>
      <div className="text-muted-foreground">Action: {concern.corrective_action}</div>
      {concern.target_date && <div className="text-muted-foreground">Target: {concern.target_date}</div>}
      <div className="mt-2 grid gap-2 md:grid-cols-[160px_1fr_auto]">
        <Input type="date" value={resolvedAt} onChange={(e) => setResolvedAt(e.target.value)} />
        <Input placeholder="Resolution notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate()}>
          {concern.resolved_at ? "Update" : "Resolve"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════ Form Dialog ═══════════════════════
type ConcernDraft = { finding: string; corrective_action: string; target_date: string };

function CertificationFormDialog({
  open, onOpenChange, orgId, hostCardId, hostName, defaultAddress, hasPriorCert, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  hostCardId: string;
  hostName: string;
  defaultAddress: string;
  hasPriorCert: boolean;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const defaultInspectorName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";

  // Active HHS clients for this org (service_codes contains HHS via client_billing_codes).
  const hhsClientsQ = useQuery({
    enabled: open,
    queryKey: ["hhs-clients-for-cert", orgId],
    queryFn: async () => {
      const todayStr = today;
      const { data: codes, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_start_date, service_end_date")
        .eq("organization_id", orgId)
        .eq("service_code", "HHS");
      if (error) throw error;
      const activeIds = (codes ?? [])
        .filter((c) => (!c.service_start_date || c.service_start_date <= todayStr)
                    && (!c.service_end_date || c.service_end_date >= todayStr))
        .map((c) => c.client_id);
      if (activeIds.length === 0) return [] as HhsClient[];
      const { data, error: cErr } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .in("id", activeIds)
        .order("last_name");
      if (cErr) throw cErr;
      return (data ?? []) as HhsClient[];
    },
  });

  const [clientId, setClientId] = useState<string>("");
  const [certType, setCertType] = useState<"initial" | "annual">(hasPriorCert ? "annual" : "initial");
  const [inspectionDate, setInspectionDate] = useState(today);
  const [inspectorName, setInspectorName] = useState(defaultInspectorName);
  const [address, setAddress] = useState(defaultAddress);
  const [notHostConfirmed, setNotHostConfirmed] = useState(false);
  const [attestationConfirmed, setAttestationConfirmed] = useState(false);
  const [answers, setAnswers] = useState<ChecklistAnswers>({});
  const [pcspStatus, setPcspStatus] = useState<"meets" | "does_not_meet">("meets");
  const [pcspNotes, setPcspNotes] = useState("");
  const [concerns, setConcerns] = useState<ConcernDraft[]>([]);
  const [determination, setDetermination] = useState<"certified" | "certified_with_corrections" | "not_certified">("certified");
  const [sigName, setSigName] = useState(defaultInspectorName);
  const [sigTitle, setSigTitle] = useState("");
  const [guardianName, setGuardianName] = useState("");

  useEffect(() => {
    if (!open) return;
    setAddress(defaultAddress);
    setInspectorName(defaultInspectorName);
    setSigName(defaultInspectorName);
    setCertType(hasPriorCert ? "annual" : "initial");
  }, [open, defaultAddress, defaultInspectorName, hasPriorCert]);

  const allItemsAnswered = ALL_ITEM_CODES.every((c) => !!answers[c]?.status);
  const allDnmHaveNotes = ALL_ITEM_CODES.every((c) => {
    const a = answers[c];
    return !a || a.status !== "does_not_meet" || (a.note ?? "").trim().length > 0;
  });
  const pcspNoteOk = pcspStatus !== "does_not_meet" || pcspNotes.trim().length > 0;
  const isCertifying = determination === "certified" || determination === "certified_with_corrections";

  const canSubmit =
    !!clientId &&
    !!inspectionDate &&
    !!inspectorName.trim() &&
    !!address.trim() &&
    !!sigName.trim() &&
    !!sigTitle.trim() &&
    allItemsAnswered &&
    allDnmHaveNotes &&
    pcspNoteOk &&
    (!isCertifying || (notHostConfirmed && attestationConfirmed));

  const createFn = useServerFn(createHostHomeCertification);
  const setPathFn = useServerFn(setHostHomeCertificatePdfPath);

  const submit = useMutation({
    mutationFn: async () => {
      const selectedClient = (hhsClientsQ.data ?? []).find((c) => c.id === clientId);
      const clientName = selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : "Client";
      const concernsClean = concerns
        .filter((c) => c.finding.trim() && c.corrective_action.trim())
        .map((c) => ({
          finding: c.finding.trim(),
          corrective_action: c.corrective_action.trim(),
          target_date: c.target_date || null,
        }));
      const { id, next_due_date } = await createFn({
        data: {
          organizationId: orgId,
          clientId,
          hhpCueCardId: hostCardId,
          cert_type: certType,
          inspection_date: inspectionDate,
          inspector_name: inspectorName.trim(),
          host_home_address: address.trim(),
          inspector_not_host_confirmed: notHostConfirmed,
          attestation_confirmed: attestationConfirmed,
          checklist: answers,
          pcsp_status: pcspStatus,
          pcsp_notes: pcspNotes || null,
          determination,
          signature_name: sigName.trim(),
          signature_title: sigTitle.trim(),
          guardian_acknowledgement_name: guardianName || null,
          concerns: concernsClean,
        },
      });

      const blob = renderCertificatePdf({
        clientName,
        hostName,
        cert_type: certType,
        inspection_date: inspectionDate,
        inspector_name: inspectorName,
        host_home_address: address,
        inspector_not_host_confirmed: notHostConfirmed,
        attestation_confirmed: attestationConfirmed,
        attestation_text: HOST_HOME_CERT_ATTESTATION_TEXT,
        checklist: answers,
        pcsp_status: pcspStatus,
        pcsp_notes: pcspNotes,
        determination,
        signature_name: sigName,
        signature_title: sigTitle,
        signed_at: new Date().toISOString(),
        guardian_acknowledgement_name: guardianName || null,
        next_due_date,
        concerns: concernsClean.map((c) => ({
          finding: c.finding, corrective_action: c.corrective_action, target_date: c.target_date,
        })),
      });
      const path = `${orgId}/${id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("host-home-certificates")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(upErr.message);

      await setPathFn({ data: { organizationId: orgId, certificationId: id, path } });
      return id;
    },
    onSuccess: () => {
      toast.success("Certification saved and certificate generated.");
      onSaved();
      onOpenChange(false);
      setAnswers({}); setConcerns([]); setPcspNotes("");
      setGuardianName(""); setNotHostConfirmed(false); setAttestationConfirmed(false);
      setClientId("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-0 flex flex-col">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-[#137182]" />
            Host Home Certification — {hostName}
          </DialogTitle>
          <DialogDescription>
            Complete the inspection for the specific person being placed. A signed certificate PDF will be generated on submit.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-4 space-y-6">
          {/* Person + header */}
          <section className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Person being placed / certified for *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder={
                  hhsClientsQ.isLoading ? "Loading HHS clients…"
                  : (hhsClientsQ.data?.length ?? 0) === 0 ? "No active HHS clients in this org"
                  : "Select the person"
                } /></SelectTrigger>
                <SelectContent>
                  {(hhsClientsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Host home address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <Label>Certification type</Label>
              <RadioGroup
                className="mt-2 flex gap-4"
                value={certType}
                onValueChange={(v) => setCertType(v as "initial" | "annual")}
              >
                <label className="flex items-center gap-1.5 text-sm">
                  <RadioGroupItem value="initial" /> Initial (pre-placement)
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <RadioGroupItem value="annual" /> Annual renewal
                </label>
              </RadioGroup>
            </div>
            <div>
              <Label>Inspection date</Label>
              <Input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Inspector (staff name)</Label>
              <Input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
              <Checkbox
                id="not-host"
                checked={notHostConfirmed}
                onCheckedChange={(v) => setNotHostConfirmed(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="not-host" className="text-sm">
                <span className="font-semibold">Required:</span> I confirm the inspector is <strong>NOT</strong> the
                host home staff for this home.
              </label>
            </div>
          </section>

          {ALL_SECTIONS.map((section) => (
            <section key={section.id}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <ChecklistItemRow
                    key={item.code}
                    label={item.label}
                    value={answers[item.code]}
                    onChange={(status, note) =>
                      setAnswers((a) => ({ ...a, [item.code]: { status, note } }))
                    }
                  />
                ))}
              </div>
            </section>
          ))}

          {/* PCSP */}
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Person-Centered Support Plan
            </h3>
            <RadioGroup
              className="flex gap-4"
              value={pcspStatus}
              onValueChange={(v) => setPcspStatus(v as "meets" | "does_not_meet")}
            >
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="meets" /> Meets
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="does_not_meet" /> Does Not Meet
              </label>
            </RadioGroup>
            <Textarea
              className="mt-2"
              placeholder={pcspStatus === "does_not_meet"
                ? "Required: explain how the home does not meet the person's PCSP needs"
                : "How the home and host support the person's PCSP needs"}
              value={pcspNotes}
              onChange={(e) => setPcspNotes(e.target.value)}
              rows={3}
            />
          </section>

          {/* Concerns */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Concerns & Corrective Actions
              </h3>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => setConcerns((c) => [...c, { finding: "", corrective_action: "", target_date: "" }])}
              >
                <Plus className="mr-1 h-4 w-4" /> Add concern
              </Button>
            </div>
            {concerns.length === 0 ? (
              <p className="text-xs text-muted-foreground">No concerns. Add one if any item was marked "Does Not Meet".</p>
            ) : (
              <div className="space-y-2">
                {concerns.map((c, i) => (
                  <div key={i} className="grid gap-2 rounded-md border p-2 md:grid-cols-[1fr_1fr_160px_auto]">
                    <Input placeholder="Finding" value={c.finding}
                      onChange={(e) => { const copy = [...concerns]; copy[i] = { ...copy[i], finding: e.target.value }; setConcerns(copy); }} />
                    <Input placeholder="Corrective action" value={c.corrective_action}
                      onChange={(e) => { const copy = [...concerns]; copy[i] = { ...copy[i], corrective_action: e.target.value }; setConcerns(copy); }} />
                    <Input type="date" value={c.target_date}
                      onChange={(e) => { const copy = [...concerns]; copy[i] = { ...copy[i], target_date: e.target.value }; setConcerns(copy); }} />
                    <Button size="icon" variant="ghost" type="button"
                      onClick={() => setConcerns((cs) => cs.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Determination */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Determination
            </h3>
            <RadioGroup
              className="flex flex-col gap-2"
              value={determination}
              onValueChange={(v) => setDetermination(v as typeof determination)}
            >
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="certified" /> Certified
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="certified_with_corrections" /> Certified with corrective actions pending
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <RadioGroupItem value="not_certified" /> Not certified
              </label>
            </RadioGroup>
          </section>

          {/* Attestation + Signature */}
          <section className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Attestation & E-Signature
            </h3>
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
              <Checkbox
                id="attest"
                checked={attestationConfirmed}
                onCheckedChange={(v) => setAttestationConfirmed(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="attest" className="text-sm leading-snug">
                <span className="font-semibold">Required attestation:</span> {HOST_HOME_CERT_ATTESTATION_TEXT}
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>E-signature — printed name *</Label>
                <Input value={sigName} onChange={(e) => setSigName(e.target.value)} />
              </div>
              <div>
                <Label>Title *</Label>
                <Input value={sigTitle} onChange={(e) => setSigTitle(e.target.value)} placeholder="Manager / Administrator" />
              </div>
              <div>
                <Label>Date</Label>
                <Input value={today} readOnly className="bg-muted" />
              </div>
              <div>
                <Label>Person / guardian acknowledgement (optional)</Label>
                <Input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Printed name" />
              </div>
            </div>
            {!canSubmit && (
              <div className="flex items-start gap-2 rounded-md bg-background p-2 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  Before submitting: select the person, answer every checklist item, add a note to every
                  "Does Not Meet"{isCertifying ? ", confirm the inspector is not the host home staff, check the attestation, and enter signature name + title" : ""}.
                </div>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t bg-background px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Saving…" : (
              <><CalendarCheck2 className="mr-1 h-4 w-4" /> Save & generate certificate</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistItemRow({
  label, value, onChange,
}: {
  label: string;
  value: { status: ChecklistStatus; note?: string } | undefined;
  onChange: (status: ChecklistStatus, note?: string) => void;
}) {
  const status = value?.status;
  const note = value?.note ?? "";
  const Pill = ({ s }: { s: ChecklistStatus }) => (
    <button
      type="button"
      onClick={() => onChange(s, note)}
      className={`min-h-[36px] rounded border px-2 py-1 text-xs font-medium transition ${
        status === s
          ? s === "meets" ? "border-emerald-500 bg-emerald-500 text-white"
          : s === "does_not_meet" ? "border-rose-500 bg-rose-500 text-white"
          : "border-slate-500 bg-slate-500 text-white"
          : "border-border bg-background hover:bg-muted"
      }`}
    >
      {statusLabel(s)}
    </button>
  );
  const noteMissing = status === "does_not_meet" && !note.trim();
  return (
    <div className={`rounded-md border p-2 ${noteMissing ? "border-rose-400" : ""}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="text-sm">{label}</div>
        <div className="flex shrink-0 items-center gap-1">
          <Pill s="meets" />
          <Pill s="does_not_meet" />
          <Pill s="na" />
        </div>
      </div>
      {status === "does_not_meet" && (
        <Input
          className={`mt-2 ${noteMissing ? "border-rose-400" : ""}`}
          placeholder='Required: note explaining "Does Not Meet"'
          value={note}
          onChange={(e) => onChange(status, e.target.value)}
        />
      )}
      {status === "meets" && (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> OK
        </div>
      )}
    </div>
  );
}
