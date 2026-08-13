import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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

  function setAns(id: string, v: unknown) { setAnswers((a) => ({ ...a, [id]: v })); }

  const visibleRequiredUnanswered = useMemo(() => {
    return fields.some((f) => {
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
    if (visibleRequiredUnanswered) {
      toast.error("Please answer all required questions.");
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

      <Card className="p-4 md:p-6 space-y-5">
        {fields.map((f) => {
          if (!isFieldVisible(f, answers, fields)) return null;
          return <FieldRenderer key={f.id} field={f} value={answers[f.id]} onChange={(v) => setAns(f.id, v)} />;
        })}
        {fields.length === 0 && <p className="text-sm text-muted-foreground">This form has no fields yet.</p>}
      </Card>

      <div className="flex justify-end">
        <Button onClick={go} disabled={busy || visibleRequiredUnanswered} className="min-h-[44px]">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit
        </Button>
      </div>
    </div>
  );
}
