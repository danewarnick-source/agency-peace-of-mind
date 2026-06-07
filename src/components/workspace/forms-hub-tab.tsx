import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientForms } from "@/lib/forms.functions";
import { describeFrequency, type Frequency, type Schedule } from "@/lib/forms-utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, CalendarClock, CheckCircle2 } from "lucide-react";

type FormRow = {
  id: string;
  name: string;
  description: string | null;
  frequency: Frequency;
  schedule: Schedule;
  category: string;
};
type SubRow = { id: string; form_id: string; period_key: string | null; submitted_at: string };

export function FormsHubTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const fetchList = useServerFn(listClientForms);
  const { data, isLoading } = useQuery({
    queryKey: ["client-forms", clientId],
    queryFn: () => fetchList({ data: { clientId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading forms…</p>;
  const forms = (data?.forms ?? []) as FormRow[];
  const subs = (data?.submissions ?? []) as SubRow[];
  const submittedByForm = new Map<string, SubRow>();
  for (const s of subs) {
    const prev = submittedByForm.get(s.form_id);
    if (!prev || new Date(s.submitted_at) > new Date(prev.submitted_at)) submittedByForm.set(s.form_id, s);
  }

  if (forms.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        No forms are assigned for {clientName} yet.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {forms.map((f) => {
        const sub = submittedByForm.get(f.id);
        const submittedThisPeriod = !!sub;
        return (
          <Card key={f.id} className="flex flex-col p-4">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm leading-tight truncate">{f.name}</p>
                {f.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{f.description}</p>}
                <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> {describeFrequency(f.frequency, f.schedule ?? {})}
                </p>
                {submittedThisPeriod && (
                  <Badge variant="outline" className="mt-2 text-[10px] gap-1 border-emerald-300 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> Submitted this period
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button asChild size="sm" className="min-h-[44px]">
                <Link to="/dashboard/forms/$formId/fill" params={{ formId: f.id }} search={{ clientId }}>
                  Complete form
                </Link>
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
