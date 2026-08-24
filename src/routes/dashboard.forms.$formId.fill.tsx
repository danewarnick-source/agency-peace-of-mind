import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Send, Loader2, ClipboardList } from "lucide-react";
import { getStaffForm, submitForm, submitIntakeForm } from "@/lib/forms.functions";
import {
  getObligationInstanceContext,
  recordCompletion,
  submitObligationForm,
  cadenceDescription,
} from "@/lib/company-obligations.functions";
import { useCurrentOrg } from "@/hooks/use-org";
import { FieldRenderer } from "@/components/forms/field-renderer";
import { type FormField, isFieldVisible } from "@/lib/forms-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const fillSearch = z.object({
  clientId: z.string().uuid().optional(),
  obligation_instance: z.string().uuid().optional(),
});

export const Route = createFileRoute("/dashboard/forms/$formId/fill")({
  head: () => ({ meta: [{ title: "Complete form — HIVE" }] }),
  validateSearch: fillSearch,
  component: FillForm,
});

function ObligationBanner({ instanceId }: { instanceId: string }) {
  const { data: org } = useCurrentOrg();
  const fetchCtx = useServerFn(getObligationInstanceContext);
  const { data } = useQuery({
    queryKey: ["obligation-instance-context", org?.organization_id, instanceId],
    enabled: !!org?.organization_id,
    queryFn: () => fetchCtx({ data: { organizationId: org!.organization_id, instanceId } }),
  });
  if (!data?.obligation || !data.instance) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
      <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Completing this form satisfies your obligation: <strong>{data.obligation.title}</strong> — {data.instance.period_key}.
        {" "}Required {cadenceDescription(data.obligation).toLowerCase()}.
      </span>
    </div>
  );
}

/** Map live client columns onto common intake form field ids. */
function seedAnswersFromClient(row: {
  first_name?: string | null;
  last_name?: string | null;
  medicaid_id?: string | null;
  phone_number?: string | null;
  physical_address?: string | null;
  is_own_guardian?: boolean | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  date_of_birth?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}): Record<string, unknown> {
  const full = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  const out: Record<string, unknown> = {};
  if (full) out.full_name = full;
  if (row.first_name) out.first_name = row.first_name;
  if (row.last_name) out.last_name = row.last_name;
  if (row.medicaid_id) out.medicaid_id = row.medicaid_id;
  if (row.phone_number) {
    out.phone = row.phone_number;
    out.phone_number = row.phone_number;
  }
  if (row.physical_address) {
    out.home_address = row.physical_address;
    out.physical_address = row.physical_address;
  }
  if (row.date_of_birth) out.date_of_birth = row.date_of_birth;
  if (row.emergency_contact_name) out.emergency_contact_name = row.emergency_contact_name;
  if (row.emergency_contact_phone) out.emergency_contact_phone = row.emergency_contact_phone;
  if (row.is_own_guardian === true) out.guardian_status = "self";
  else if (row.is_own_guardian === false) {
    out.guardian_status = "guardian";
    if (row.guardian_name) out.guardian_name = row.guardian_name;
    if (row.guardian_phone) out.guardian_phone = row.guardian_phone;
  }
  return out;
}

function FillForm() {
  const { formId } = Route.useParams();
  const { clientId, obligation_instance: obligationInstanceId } = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchForm = useServerFn(getStaffForm);
  const submit = useServerFn(submitForm);
  const submitIntake = useServerFn(submitIntakeForm);
  const submitObligation = useServerFn(submitObligationForm);
  const recordObligationCompletion = useServerFn(recordCompletion);

  const { data, isLoading } = useQuery({ queryKey: ["staff-form", formId], queryFn: () => fetchForm({ data: { formId } }) });
  const fields = useMemo<FormField[]>(() => (Array.isArray(data?.form?.fields) ? data!.form!.fields as FormField[] : []), [data]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill intake answers from the client profile once (name, medicaid, address, etc.).
  useEffect(() => {
    if (!clientId || prefilled || fields.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data: row } = await supabase
        .from("clients")
        .select(
          "first_name, last_name, medicaid_id, phone_number, physical_address, is_own_guardian, guardian_name, guardian_phone, date_of_birth, emergency_contact_name, emergency_contact_phone",
        )
        .eq("id", clientId)
        .maybeSingle();
      if (cancelled || !row) {
        setPrefilled(true);
        return;
      }
      const seed = seedAnswersFromClient(row);
      const fieldIds = new Set(fields.map((f) => f.id));
      setAnswers((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(seed)) {
          if (!fieldIds.has(k)) continue;
          const cur = next[k];
          if (cur === undefined || cur === null || cur === "") next[k] = v;
        }
        return next;
      });
      setPrefilled(true);
    })().catch(() => setPrefilled(true));
    return () => { cancelled = true; };
  }, [clientId, fields, prefilled]);

  function setAns(id: string, v: unknown) { setAnswers((a) => ({ ...a, [id]: v })); }

  const unansweredRequired = useMemo(() => {
    return fields.filter((f) => {
      if (f.type === "section" || !f.required) return false;
      if (!isFieldVisible(f, answers, fields)) return false;
      const v = answers[f.id];
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    });
  }, [fields, answers]);

  function backToClient() {
    navigate({ to: "/dashboard/workspace/$clientId", params: { clientId: clientId! }, search: { tab: "forms" } });
  }

  async function go() {
    if (unansweredRequired.length > 0) {
      const labels = unansweredRequired.slice(0, 5).map((f) => f.label || f.id);
      toast.error(
        unansweredRequired.length === 1
          ? `Please complete: ${labels[0]}`
          : `Please complete ${unansweredRequired.length} required fields (${labels.join(", ")}${unansweredRequired.length > 5 ? "…" : ""}).`,
      );
      const first = unansweredRequired[0];
      if (first) {
        document.getElementById(`field-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    setBusy(true);
    try {
      const visible: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.type === "section") continue;
        if (isFieldVisible(f, answers, fields) && answers[f.id] !== undefined) visible[f.id] = answers[f.id];
      }

      if (obligationInstanceId) {
        const result = await submitObligation({
          data: { organizationId: org!.organization_id, instanceId: obligationInstanceId, formId, answers: visible },
        });
        if (result.submissionId) {
          await recordObligationCompletion({
            data: {
              organizationId: org!.organization_id,
              instanceId: obligationInstanceId,
              evidenceTypeUsed: "form",
              formSubmissionId: result.submissionId,
            },
          });
        }
        toast.success("Form submitted — obligation marked complete.");
        navigate({ to: "/dashboard/my-obligations" });
        return;
      }

      // Intake-category forms go through the role-gated admin path; all
      // other categories keep the unchanged staff submitForm (caseload-gated).
      const isIntake = (data?.form?.category ?? null) === "intake";
      const submitFn = isIntake ? submitIntake : submit;
      await submitFn({ data: { formId, clientId: clientId!, answers: visible } });
      qc.invalidateQueries({ queryKey: ["client-forms", clientId] });
      toast.success("Submitted to client's record");
      backToClient();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.form) return <p className="text-sm text-muted-foreground">Form not available.</p>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {obligationInstanceId && <ObligationBanner instanceId={obligationInstanceId} />}

      <div className="flex items-center gap-2">
        {clientId && (
          <Button variant="ghost" size="icon" onClick={backToClient}><ChevronLeft className="h-4 w-4" /></Button>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{data.form.name}</h1>
          {data.form.description && <p className="text-xs text-muted-foreground">{data.form.description}</p>}
        </div>
      </div>

      {unansweredRequired.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {unansweredRequired.length} required field{unansweredRequired.length === 1 ? "" : "s"} still need answers before you can submit.
        </div>
      )}

      <Card className="p-4 md:p-6 space-y-5">
        {fields.map((f) => {
          if (!isFieldVisible(f, answers, fields)) return null;
          const missing = unansweredRequired.some((u) => u.id === f.id);
          return (
            <div key={f.id} id={`field-${f.id}`} className={missing ? "rounded-md ring-1 ring-destructive/50 p-2 -m-2" : undefined}>
              <FieldRenderer field={f} value={answers[f.id]} onChange={(v) => setAns(f.id, v)} />
            </div>
          );
        })}
        {fields.length === 0 && <p className="text-sm text-muted-foreground">This form has no fields yet.</p>}
      </Card>

      <div className="flex justify-end">
        <Button onClick={go} disabled={busy} className="min-h-[44px]">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit
        </Button>
      </div>
    </div>
  );
}
