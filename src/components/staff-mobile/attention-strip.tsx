import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileText, GraduationCap, BookOpen, ChevronRight, BellRing } from "lucide-react";
import { getMyCeStatus } from "@/lib/ce.functions";
import { listMyForms, getMyFormNotifications } from "@/lib/forms.functions";
import { getMyOtherAssignmentsSummary } from "@/lib/other-assignments.functions";
import { listSmartImportReminders } from "@/lib/smart-import-reminders.functions";
import { getMyClientTrainingStatuses } from "@/lib/client-specific-training.functions";
import {
  periodKeyFor, dueDateFor, isOverdue,
  type Frequency, type Schedule,
} from "@/lib/forms-utils";
import { NectarPayPeriodCard } from "@/components/staff-mobile/nectar-pay-period-card";

type FormRow = { id: string; name: string; frequency: Frequency; schedule: Schedule };

type Chip = {
  key: string;
  to: string;
  label: string;
  icon: typeof FileText;
  tone: "warn" | "danger" | "info";
};

/**
 * Zone 2 — compact attention strip: collapses the formerly large CE / forms /
 * other-trainings cards into one slim row of tappable chips. NECTAR
 * pay-period readout sits alongside as a slim pill (the component is already
 * collapsible by default).
 */
export function AttentionStrip() {
  const fetchCe = useServerFn(getMyCeStatus);
  const fetchForms = useServerFn(listMyForms);
  const fetchBell = useServerFn(getMyFormNotifications);
  const fetchOther = useServerFn(getMyOtherAssignmentsSummary);
  const fetchSI = useServerFn(listSmartImportReminders);
  const fetchCT = useServerFn(getMyClientTrainingStatuses);

  const { data: ce } = useQuery({ queryKey: ["ce-status"], queryFn: () => fetchCe(), staleTime: 60_000 });
  const { data: formsData } = useQuery({ queryKey: ["my-forms"], queryFn: () => fetchForms(), staleTime: 60_000 });
  const { data: bell } = useQuery({ queryKey: ["my-form-notifs"], queryFn: () => fetchBell(), staleTime: 60_000 });
  const { data: other } = useQuery({ queryKey: ["my-other-assignments-summary"], queryFn: () => fetchOther() });
  const { data: si } = useQuery({ queryKey: ["my-smart-import-reminders"], queryFn: () => fetchSI({ data: { scope: "mine" } }), staleTime: 60_000 });
  const { data: ct } = useQuery({ queryKey: ["my-client-training-statuses"], queryFn: () => fetchCT(), staleTime: 60_000 });


  const chips: Chip[] = [];

  // Forms — compute due/overdue exactly like FormsReminderCard.
  const forms = (formsData?.forms ?? []) as FormRow[];
  const subs = formsData?.submissions ?? [];
  let due = 0, overdue = 0;
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
  if (overdue > 0) {
    chips.push({
      key: "forms-overdue", to: "/dashboard/forms", icon: FileText, tone: "danger",
      label: `${overdue} form${overdue === 1 ? "" : "s"} overdue`,
    });
  } else if (due > 0) {
    chips.push({
      key: "forms-due", to: "/dashboard/forms", icon: FileText, tone: "warn",
      label: `${due} form${due === 1 ? "" : "s"} due`,
    });
  } else if (unreadAssigned > 0) {
    chips.push({
      key: "forms-new", to: "/dashboard/forms", icon: FileText, tone: "info",
      label: `${unreadAssigned} new form${unreadAssigned === 1 ? "" : "s"}`,
    });
  }

  // CE — only when behind or current module not done, mirroring CeReminderCard.
  if (ce && ce.ceApplies) {
    const remaining = Math.max(0, ce.goalHours - ce.hoursThisYear);
    if (remaining > 0) {
      const monthsIn = ce.ceYearStart
        ? Math.min(12, Math.max(0, Math.round((Date.now() - new Date(ce.ceYearStart + "T00:00:00Z").getTime()) / (86_400_000 * 30))))
        : 0;
      const expected = Math.min(ce.goalHours, (ce.goalHours * monthsIn) / 12);
      const behind = ce.hoursThisYear + 0.001 < expected;
      const currentMonthDone = ce.currentModule?.status === "completed";
      if (behind || !currentMonthDone) {
        chips.push({
          key: "ce", to: "/dashboard/courses/ce", icon: GraduationCap,
          tone: behind ? "warn" : "info",
          label: `${remaining.toFixed(1)} CE hrs left`,
        });
      }
    }
  }

  // Other trainings — show only if open; safety-critical gets danger tone.
  if (other && other.open_count > 0) {
    const safety = other.safety_critical_open_count > 0;
    chips.push({
      key: "other",
      to: "/dashboard/courses/other",
      icon: safety ? AlertTriangle : BookOpen,
      tone: safety ? "danger" : "warn",
      label: safety
        ? `${other.safety_critical_open_count} safety training${other.safety_critical_open_count === 1 ? "" : "s"}`
        : `${other.open_count} training${other.open_count === 1 ? "" : "s"} open`,
    });
  }

  // Smart Import reminders for me — provisional/expiring certs needing upload.
  const siCount = (si?.reminders ?? []).length;
  if (siCount > 0) {
    const hasCritical = (si?.reminders ?? []).some((r: { urgency: string }) => r.urgency === "critical");
    chips.push({
      key: "smart-import",
      to: "/dashboard/external-certifications",
      icon: BellRing,
      tone: hasCritical ? "danger" : "warn",
      label: `${siCount} cert reminder${siCount === 1 ? "" : "s"}`,
    });
  }

  // Client-specific training & support strategies — published trainings the staff hasn't completed yet.
  {
    let clientsWithDue = 0;
    let totalDue = 0;
    for (const it of (ct?.items ?? [])) {
      const due = (it.trainings ?? []).filter(
        (t: { setupStatus: string; completionStatus: string }) =>
          t.setupStatus === "published" && t.completionStatus === "not_started",
      ).length;
      if (due > 0) { clientsWithDue++; totalDue += due; }
    }
    if (clientsWithDue > 0) {
      chips.push({
        key: "client-training-due",
        to: "/dashboard/my-client-trainings",
        icon: GraduationCap,
        tone: "warn",
        label: `${totalDue} training${totalDue === 1 ? "" : "s"} due`,
      });
    }
  }




  // If nothing needs attention, render the NECTAR card on its own (slim).
  return (
    <div className="space-y-2">
      {chips.length > 0 && (
        <ul
          aria-label="Needs attention"
          className="flex flex-wrap gap-2"
        >
          {chips.map((c) => {
            const Icon = c.icon;
            const toneCls =
              c.tone === "danger"
                ? "border-rose-300/60 bg-rose-500/5 text-rose-700 hover:border-rose-400"
                : c.tone === "warn"
                  ? "border-amber-300/60 bg-amber-500/5 text-amber-800 hover:border-amber-400"
                  : "border-primary/30 bg-primary/5 text-primary hover:border-primary/50";
            return (
              <li key={c.key}>
                <Link
                  to={c.to as "/dashboard/forms"}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${toneCls}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {c.label}
                  <ChevronRight className="h-3 w-3 opacity-60" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <NectarPayPeriodCard />
    </div>
  );
}
