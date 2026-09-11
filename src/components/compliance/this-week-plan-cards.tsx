import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LicenseRiskPlanDialog } from "@/components/compliance/license-risk-plan-dialog";
import { OverdueObligationPlanDialog } from "@/components/compliance/overdue-obligation-plan-dialog";
import { StandingRecordPlanDialog } from "@/components/compliance/standing-record-plan-dialog";
import { Button } from "@/components/ui/button";
import { useCurrentOrg } from "@/hooks/use-org";
import { isAdminLevelRole } from "@/lib/obligations/escalation";
import { kindFromEscalationTrigger } from "@/lib/obligations/remediation";
import {
  getThisWeekForUser,
  reviewRemediationPlan,
} from "@/lib/obligations/remediation.functions";
import type { Decision, ThisWeekItem } from "@/lib/obligations/this-week.functions";
import { PI_THEME } from "@/lib/pi-theme";

type PlanDialogKind = "license" | "standing" | "overdue";

function urgencyBar(urgency: Decision["urgency"]): string {
  if (urgency === "critical") return PI_THEME.red;
  if (urgency === "high") return PI_THEME.amber;
  return PI_THEME.ok;
}

export function kindLabel(item: Decision): string {
  if (item.planKind === "solo_lapse") return "Solo lapse";
  if (item.planKind === "scheduled_while_lapsed") return "Scheduled while lapsed";
  if (item.planKind === "license_risk") return "License / repayment";
  if (item.planKind === "standing_missing") return "Standing record";
  if (item.planKind === "overdue") return "Overdue plan";
  if (item.source === "nectar_proposed") return "Proposed requirement";
  switch (item.trigger) {
    case "half_window_not_started":
      return "Due soon";
    case "overdue":
      return "Overdue";
    case "would_create_finding_if_scheduled":
      return "Scheduling risk";
    case "license_or_repayment_risk":
      return "License / repayment";
    case "standing_record_missing_30d":
      return "Standing record";
    default:
      if (process.env.NODE_ENV !== "production") {
        throw new Error(`Unknown this-week trigger: ${String(item.trigger ?? item.source)}`);
      }
      return "This week";
  }
}

export function logPlanDialogKind(item: Decision): PlanDialogKind | null {
  if (item.planId) return null;
  if (item.trigger === "license_or_repayment_risk") return "license";
  if (item.trigger === "standing_record_missing_30d") return "standing";
  if (item.trigger === "half_window_not_started" || item.trigger === "overdue") {
    if (item.planKind === "solo_lapse") return null;
    if (kindFromEscalationTrigger(item.trigger, item.obligationKey) === "solo_lapse") {
      return null;
    }
    return "overdue";
  }
  return null;
}

function PlanCard({
  item,
  canReview,
  onReview,
  reviewing,
  onLogPlan,
}: {
  item: Decision;
  canReview: boolean;
  onReview: (planId: string, decision: "approved" | "rejected") => void;
  reviewing: boolean;
  onLogPlan: (kind: PlanDialogKind, item: Decision) => void;
}) {
  const logKind = logPlanDialogKind(item);
  return (
    <li
      className="rounded-lg p-3 pl-3"
      style={{
        background: PI_THEME.heroTileBg,
        border: `1px solid ${PI_THEME.hairlines.faint}`,
        borderLeft: `4px solid ${urgencyBar(item.urgency)}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: PI_THEME.c50 }}
          >
            {kindLabel(item)}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium" style={{ color: PI_THEME.cream }}>
            {item.title}
          </div>
          <p className="mt-1 text-xs" style={{ color: PI_THEME.c50 }}>
            {item.body}
          </p>
          <p className="mt-1 text-xs" style={{ color: PI_THEME.c70 }}>
            {item.consequence}
          </p>
        </div>
        {item.dueAt ? (
          <div className="shrink-0 text-xs tabular-nums" style={{ color: PI_THEME.c50 }}>
            {item.dueAt.slice(0, 10)}
          </div>
        ) : null}
      </div>
      {canReview && item.planId ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            disabled={reviewing}
            onClick={() => onReview(item.planId!, "approved")}
          >
            Approve plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={reviewing}
            onClick={() => onReview(item.planId!, "rejected")}
          >
            Reject
          </Button>
        </div>
      ) : null}
      {!item.planId && logKind ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onLogPlan(logKind, item)}>
            {logKind === "standing" ? "Edit the starter / log a plan" : "Log a plan"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function ThisWeekPlanCards() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const loadWeek = useServerFn(getThisWeekForUser);
  const review = useServerFn(reviewRemediationPlan);
  const [openKind, setOpenKind] = useState<PlanDialogKind | null>(null);
  const [activeItem, setActiveItem] = useState<Decision | null>(null);

  const orgId = org?.organization_id ?? null;
  const canManage = org ? isAdminLevelRole(org.role) || org.role === "manager" || org.role === "program_manager" : false;

  const q = useQuery({
    enabled: !!orgId && canManage,
    queryKey: ["this-week-plans", orgId],
    queryFn: () => loadWeek({ data: { organizationId: orgId! } }),
    staleTime: 60_000,
  });

  const reviewMut = useMutation({
    mutationFn: (input: { planId: string; decision: "approved" | "rejected" }) => {
      if (!orgId) throw new Error("No active organization");
      return review({
        data: {
          organizationId: orgId,
          planId: input.planId,
          decision: input.decision,
        },
      });
    },
    onSuccess: () => {
      toast.success("Plan updated.");
      void qc.invalidateQueries({ queryKey: ["this-week-plans", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!orgId || !canManage) return null;

  const items = (q.data ?? []).filter((i): i is Decision => i.kind === "decision");
  if (q.isLoading) {
    return (
      <section data-testid="this-week" className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: PI_THEME.cream }}>
          This week
        </h2>
        <p className="text-sm" style={{ color: PI_THEME.c50 }}>
          Loading decisions.
        </p>
      </section>
    );
  }
  if (q.isError) {
    return (
      <section data-testid="this-week" className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: PI_THEME.cream }}>
          This week
        </h2>
        <p className="text-sm" style={{ color: PI_THEME.c50 }}>
          Could not load this week.
        </p>
      </section>
    );
  }
  if (items.length === 0) {
    return (
      <section data-testid="this-week" className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: PI_THEME.cream }}>
          This week
        </h2>
        <p className="text-sm" style={{ color: PI_THEME.c50 }}>
          No manager decisions waiting.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="this-week" className="space-y-2">
      <h2 className="text-sm font-semibold" style={{ color: PI_THEME.cream }}>
        This week
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <PlanCard
            key={item.id}
            item={item}
            canReview={!!item.planId}
            reviewing={reviewMut.isPending}
            onReview={(planId, decision) => reviewMut.mutate({ planId, decision })}
            onLogPlan={(kind, next) => {
              setActiveItem(next);
              setOpenKind(kind);
            }}
          />
        ))}
      </ul>
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

export function thisWeekDecisionCount(items: ThisWeekItem[] | undefined): number {
  return (items ?? []).filter((i) => i.kind === "decision").length;
}
