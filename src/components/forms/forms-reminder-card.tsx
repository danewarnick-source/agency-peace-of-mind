// Staff dashboard reminder card for custom Forms.
// Compute-on-read: shows when one or more assigned forms are due/overdue in
// the current period, or when a new form_assigned notification is unread.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyForms, getMyFormNotifications } from "@/lib/forms.functions";
import {
  periodKeyFor, dueDateFor, isOverdue,
  type Frequency, type Schedule,
} from "@/lib/forms-utils";

type FormRow = { id: string; name: string; frequency: Frequency; schedule: Schedule };

export function FormsReminderCard() {
  const fetchMine = useServerFn(listMyForms);
  const fetchBell = useServerFn(getMyFormNotifications);
  const { data } = useQuery({ queryKey: ["my-forms"], queryFn: () => fetchMine(), staleTime: 60_000 });
  const { data: bell } = useQuery({ queryKey: ["my-form-notifs"], queryFn: () => fetchBell(), staleTime: 60_000 });

  const forms = (data?.forms ?? []) as FormRow[];
  const subs = data?.submissions ?? [];

  let due = 0; let overdue = 0;
  for (const f of forms) {
    if (f.frequency === "as_needed") continue;
    const periodKey = periodKeyFor(f.frequency);
    const done = subs.find((s) => s.form_id === f.id && s.period_key === periodKey);
    if (done) continue;
    due++;
    if (isOverdue(dueDateFor(f.frequency, f.schedule))) overdue++;
  }
  const unreadAssigned = (bell?.notifications ?? []).filter(
    (n: { read_at: string | null; type: string }) => !n.read_at && n.type === "form_assigned"
  ).length;

  if (due === 0 && unreadAssigned === 0) return null;

  const tone = overdue > 0 ? "border-rose-300/50 bg-rose-500/5" : "border-amber-300/50 bg-amber-500/5";
  const iconTone = overdue > 0 ? "text-rose-600" : "text-amber-600";

  return (
    <div className={`rounded-2xl border ${tone} p-4 shadow-[var(--shadow-card)]`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background ${iconTone}`}>
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold tracking-tight">
            {overdue > 0
              ? `${overdue} form${overdue === 1 ? "" : "s"} overdue`
              : due > 0
                ? `${due} form${due === 1 ? "" : "s"} due this period`
                : `${unreadAssigned} new form${unreadAssigned === 1 ? "" : "s"} assigned to you`}
          </p>
          <p className="text-xs text-muted-foreground">
            Open Forms to complete what your agency has assigned to you.
          </p>
        </div>
        <Link to="/dashboard/forms">
          <Button size="sm" className="min-h-[40px]">Open Forms <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
        </Link>
      </div>
    </div>
  );
}
