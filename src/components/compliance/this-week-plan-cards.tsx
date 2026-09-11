import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { DecisionCard } from "@/components/compliance/decision-card";
import { LicenseRiskPlanDialog } from "@/components/compliance/license-risk-plan-dialog";
import { OverdueObligationPlanDialog } from "@/components/compliance/overdue-obligation-plan-dialog";
import { StandingRecordPlanDialog } from "@/components/compliance/standing-record-plan-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { isAdminLevelRole } from "@/lib/obligations/escalation";
import { kindFromEscalationTrigger } from "@/lib/obligations/remediation";
import {
  getThisWeekForUser,
  reviewRemediationPlan,
} from "@/lib/obligations/remediation.functions";
import {
  decorateDecision,
  emptyQuietLine,
  formatQuietLine,
  rollupDecisions,
  type Decision,
  type QuietLine,
  type ThisWeekItem,
  type ThisWeekResult,
} from "@/lib/obligations/this-week.functions";
import { PI_THEME } from "@/lib/pi-theme";
import "./decision-card.css";

export { DecisionCard as PlanCard } from "@/components/compliance/decision-card";

type PlanDialogKind = "license" | "standing" | "overdue";

const HOME_CARD_CAP = 3;

export function logPlanDialogKind(item: Decision): PlanDialogKind | null {
  if (item.planId) return null;
  if (item.action?.kind === "log_renewal" || item.trigger === "license_or_repayment_risk") {
    return "license";
  }
  if (item.action?.kind === "read_and_sign" || item.trigger === "standing_record_missing_30d") {
    return "standing";
  }
  if (
    item.action?.kind === "log_plan" ||
    item.trigger === "half_window_not_started" ||
    item.trigger === "overdue"
  ) {
    if (item.planKind === "solo_lapse") return null;
    if (
      item.trigger &&
      kindFromEscalationTrigger(item.trigger, item.obligationKey) === "solo_lapse"
    ) {
      return null;
    }
    return "overdue";
  }
  return null;
}

function asWeek(data: ThisWeekResult | ThisWeekItem[] | undefined): {
  items: Decision[];
  quiet: QuietLine;
} {
  if (!data) return { items: [], quiet: emptyQuietLine() };
  if (Array.isArray(data)) {
    return {
      items: data.filter((i): i is Decision => i.kind === "decision"),
      quiet: emptyQuietLine(),
    };
  }
  return {
    items: data.items ?? [],
    quiet: data.quiet ?? emptyQuietLine(),
  };
}

export function ThisWeekPlanCards() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const loadWeek = useServerFn(getThisWeekForUser);
  const review = useServerFn(reviewRemediationPlan);
  const [openKind, setOpenKind] = useState<PlanDialogKind | null>(null);
  const [activeItem, setActiveItem] = useState<Decision | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const orgId = org?.organization_id ?? null;
  const canManage = org
    ? isAdminLevelRole(org.role) || org.role === "manager" || org.role === "program_manager"
    : false;
  const viewerId = user?.id ?? null;

  const q = useQuery({
    enabled: !!orgId && canManage,
    queryKey: ["this-week-plans", orgId],
    queryFn: () => loadWeek({ data: { organizationId: orgId! } }),
    staleTime: 60_000,
  });

  const reviewMut = useMutation({
    mutationFn: (input: { planId: string; decision: "approved" | "rejected"; id: string }) => {
      if (!orgId) throw new Error("No active organization");
      return review({
        data: {
          organizationId: orgId,
          planId: input.planId,
          decision: input.decision,
        },
      });
    },
    onSuccess: (_ok, input) => {
      toast.success("Plan updated.");
      setDoneIds((prev) => new Set(prev).add(input.id));
      void qc.invalidateQueries({ queryKey: ["this-week-plans", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!orgId || !canManage) return null;

  const week = asWeek(q.data);
  const items = rollupDecisions(week.items).map((d) =>
    decorateDecision(d, { viewerUserId: viewerId }),
  );
  const visible = items.slice(0, HOME_CARD_CAP);
  const extra = Math.max(0, items.length - HOME_CARD_CAP);
  const quietText = formatQuietLine(week.quiet);

  const countLine =
    items.length === 0
      ? "Nothing needs you this week."
      : `${items.length} decision${items.length === 1 ? "" : "s"}. Everything else is delegated and quiet.`;

  return (
    <section data-testid="this-week" className="space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold leading-tight" style={{ color: PI_THEME.cream }}>
          This week
        </h2>
        <p className="mt-1 text-sm" style={{ color: PI_THEME.c50 }}>
          {q.isLoading ? "Loading decisions." : q.isError ? "Could not load this week." : countLine}
        </p>
      </div>
      {!q.isLoading && !q.isError && items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visible.map((item) => (
            <DecisionCard
              key={item.id}
              item={item}
              done={doneIds.has(item.id)}
              reviewing={reviewMut.isPending}
              onAction={(kind, decision) => {
                if (kind === "approve_plan") {
                  if (!item.planId) return;
                  reviewMut.mutate({
                    planId: item.planId,
                    decision: decision === "rejected" ? "rejected" : "approved",
                    id: item.id,
                  });
                  return;
                }
                const logKind = logPlanDialogKind(item);
                if (!logKind) return;
                setActiveItem(item);
                setOpenKind(logKind);
              }}
            />
          ))}
        </ul>
      ) : null}
      {extra > 0 ? (
        <Link
          to="/dashboard/compliance"
          className="inline-flex text-sm font-medium hover:underline"
          style={{ color: PI_THEME.gold }}
        >
          {extra} more this week →
        </Link>
      ) : null}
      <div
        data-testid="quiet-line"
        className="quiet-line"
        style={{
          background: PI_THEME.c04,
          color: PI_THEME.c50,
          border: `1px solid ${PI_THEME.hairlines.faint}`,
        }}
      >
        {quietText}
      </div>
      {activeItem ? (
        <>
          <LicenseRiskPlanDialog
            key={`${activeItem.id}-license`}
            open={openKind === "license"}
            organizationId={orgId}
            item={activeItem}
            onOpenChange={(open) => {
              if (!open) setOpenKind(null);
            }}
          />
          <StandingRecordPlanDialog
            key={`${activeItem.id}-standing`}
            open={openKind === "standing"}
            organizationId={orgId}
            item={activeItem}
            onOpenChange={(open) => {
              if (!open) setOpenKind(null);
            }}
          />
          <OverdueObligationPlanDialog
            key={`${activeItem.id}-overdue`}
            open={openKind === "overdue"}
            organizationId={orgId}
            item={activeItem}
            onOpenChange={(open) => {
              if (!open) setOpenKind(null);
            }}
          />
        </>
      ) : null}
    </section>
  );
}

export function thisWeekDecisionCount(
  items: ThisWeekItem[] | ThisWeekResult | undefined,
): number {
  if (!items) return 0;
  if (Array.isArray(items)) return items.filter((i) => i.kind === "decision").length;
  return items.items.length;
}
