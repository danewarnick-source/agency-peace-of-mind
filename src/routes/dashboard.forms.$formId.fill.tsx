import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Send, Loader2 } from "lucide-react";
import { getStaffForm, submitForm } from "@/lib/forms.functions";
import { FieldRenderer } from "@/components/forms/field-renderer";
import { type FormField, isFieldVisible } from "@/lib/forms-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/forms/$formId/fill")({
  head: () => ({ meta: [{ title: "Fill form — HIVE" }] }),
  component: FillForm,
});

function FillForm() {
  const { formId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchForm = useServerFn(getStaffForm);
  const submit = useServerFn(submitForm);

  const { data, isLoading } = useQuery({ queryKey: ["staff-form", formId], queryFn: () => fetchForm({ data: { formId } }) });
  const fields = useMemo<FormField[]>(() => (Array.isArray(data?.form?.fields) ? data!.form!.fields as FormField[] : []), [data]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  function setAns(id: string, v: unknown) { setAnswers((a) => ({ ...a, [id]: v })); }

  async function go() {
    for (const f of fields) {
      if (f.type === "section" || !f.required) continue;
      if (!isFieldVisible(f, answers, fields)) continue; // hidden required fields don't block
      const v = answers[f.id];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) { toast.error(`Please answer: ${f.label}`); return; }
    }
    setBusy(true);
    try {
      // Strip answers for hidden fields so they aren't stored
      const visible: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.type === "section") continue;
        if (isFieldVisible(f, answers, fields) && answers[f.id] !== undefined) visible[f.id] = answers[f.id];
      }
      await submit({ data: { formId, answers: visible } });
      qc.invalidateQueries({ queryKey: ["my-forms"] });
      toast.success("Submitted");
      navigate({ to: "/dashboard/forms" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.form) return <p className="text-sm text-muted-foreground">Form not available.</p>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/dashboard/forms" })}><ChevronLeft className="h-4 w-4" /></Button>
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
        <Button onClick={go} disabled={busy} className="min-h-[44px]">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit
        </Button>
      </div>
    </div>
  );
}
