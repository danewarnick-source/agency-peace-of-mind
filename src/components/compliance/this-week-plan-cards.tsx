import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentOrg } from "@/hooks/use-org";
import { isAdminLevelRole } from "@/lib/obligations/escalation";
import {
  getThisWeekForUser,
  reviewRemediationPlan,
} from "@/lib/obligations/remediation.functions";
import { generateMyReview, listPackWhatChanged } from "@/lib/obligations/review-pack.functions";
import type { Decision, QuietSummary, ThisWeekItem } from "@/lib/obligations/this-week.functions";
import { PI_THEME } from "@/lib/pi-theme";

function urgencyBar(urgency: Decision["urgency"]): string {
  if (urgency === "critical") return PI_THEME.red;
  if (urgency === "high") return PI_THEME.amber;
  return PI_THEME.ok;
}

function kindLabel(item: Decision): string {
  if (item.planKind === "solo_lapse") return "Solo lapse";
  if (item.planKind === "scheduled_while_lapsed") return "Scheduled while lapsed";
  if (item.planKind === "license_risk") return "License / repayment";
  if (item.planKind === "standing_missing") return "Standing record";
  if (item.planKind === "overdue") return "Overdue plan";
  if (item.source === "standing_missing") return "Standing missing";
  if (item.source === "nectar_proposed") return "Proposed requirement";
  if (item.source === "escalation") return "Escalation";
  return "This week";
}

function PlanCard({
  item,
  canReview,
  onReview,
  reviewing,
}: {
  item: Decision;
  canReview: boolean;
  onReview: (planId: string, decision: "approved" | "rejected") => void;
  reviewing: boolean;
}) {
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
    </li>
  );
}

function QuietCard({ item }: { item: QuietSummary }) {
  return (
    <li
      className="rounded-lg p-3"
      style={{
        background: PI_THEME.heroTileBg,
        border: `1px solid ${PI_THEME.hairlines.faint}`,
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: PI_THEME.c50 }}
      >
        Quiet
      </div>
      <div className="mt-0.5 text-sm font-medium" style={{ color: PI_THEME.cream }}>
        {item.title}
      </div>
      <p className="mt-1 text-xs" style={{ color: PI_THEME.c50 }}>
        {item.body}
      </p>
    </li>
  );
}

export function ThisWeekPlanCards() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const loadWeek = useServerFn(getThisWeekForUser);
  const review = useServerFn(reviewRemediationPlan);
  const loadChanges = useServerFn(listPackWhatChanged);
  const generateReview = useServerFn(generateMyReview);
  const [reviewText, setReviewText] = useState<string | null>(null);

  const orgId = org?.organization_id ?? null;
  const canManage = org
    ? isAdminLevelRole(org.role) || org.role === "manager" || org.role === "program_manager"
    : false;
  const scoped = !!org && !isAdminLevelRole(org.role);

  const q = useQuery({
    enabled: !!orgId && canManage,
    queryKey: ["this-week-plans", orgId],
    queryFn: () => loadWeek({ data: { organizationId: orgId! } }),
    staleTime: 60_000,
  });

  const changesQ = useQuery({
    enabled: !!orgId && canManage,
    queryKey: ["pack-what-changed", orgId],
    queryFn: () => loadChanges({ data: { organizationId: orgId! } }),
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

  const generateMut = useMutation({
    mutationFn: () => {
      if (!orgId) throw new Error("No active organization");
      return generateReview({ data: { organizationId: orgId } });
    },
    onSuccess: (pack) => {
      if (!pack) {
        toast.error("Could not generate review.");
        return;
      }
      setReviewText(pack.text);
      toast.success("Draft review ready. Not published.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!orgId) return null;
  if (!canManage) return null;

  const decisions = (q.data ?? []).filter((i): i is Decision => i.kind === "decision");
  const quiet = (q.data ?? []).filter((i): i is QuietSummary => i.kind === "quiet_summary");
  const changes = changesQ.data?.changes ?? [];

  return (
    <section className="space-y-3" data-testid="this-week">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: PI_THEME.cream }}>
            This week
          </h2>
          {scoped ? (
            <p className="mt-0.5 text-xs" style={{ color: PI_THEME.c50 }}>
              Manager scope — your team only.
            </p>
          ) : (
            <p className="mt-0.5 text-xs" style={{ color: PI_THEME.c50 }}>
              Organization queue.
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={generateMut.isPending}
          onClick={() => generateMut.mutate()}
        >
          Generate my review
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-sm" style={{ color: PI_THEME.c50 }}>
          Loading decisions.
        </p>
      ) : q.isError ? (
        <p className="text-sm" style={{ color: PI_THEME.c50 }}>
          Could not load this week.
        </p>
      ) : decisions.length === 0 && quiet.length === 0 ? (
        <p className="text-sm" style={{ color: PI_THEME.c50 }}>
          No manager decisions waiting.
        </p>
      ) : (
        <ul className="space-y-2">
          {decisions.map((item) => (
            <PlanCard
              key={item.id}
              item={item}
              canReview={!!item.planId}
              reviewing={reviewMut.isPending}
              onReview={(planId, decision) => reviewMut.mutate({ planId, decision })}
            />
          ))}
          {quiet.map((item) => (
            <QuietCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      {reviewText ? (
        <div
          className="rounded-lg p-3"
          style={{
            background: PI_THEME.heroTileBg,
            border: `1px solid ${PI_THEME.hairlines.faint}`,
          }}
          data-testid="this-week-review-draft"
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: PI_THEME.c50 }}
          >
            Draft — not published
          </p>
          <pre
            className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs"
            style={{ color: PI_THEME.c70 }}
          >
            {reviewText}
          </pre>
        </div>
      ) : null}

      <div data-testid="pack-what-changed">
        <h3 className="text-sm font-semibold" style={{ color: PI_THEME.cream }}>
          What changed
        </h3>
        {changesQ.isLoading ? (
          <p className="mt-1 text-xs" style={{ color: PI_THEME.c50 }}>
            Loading pack changelog.
          </p>
        ) : changes.length === 0 ? (
          <p className="mt-1 text-xs" style={{ color: PI_THEME.c50 }}>
            No pack changelog rows for this version.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {changes.slice(0, 8).map((row) => (
              <li key={`${row.pack_version}:${row.obligation_key}:${row.change_kind}`} className="text-xs" style={{ color: PI_THEME.c70 }}>
                {row.change_kind}: {row.obligation_key}
                {row.note ? ` — ${row.note}` : ""}
              </li>
            ))}
            {changes.length > 8 ? (
              <li className="text-xs" style={{ color: PI_THEME.c50 }}>
                {changes.length - 8} more catalog keys in this pack.
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </section>
  );
}

export function thisWeekDecisionCount(items: ThisWeekItem[] | undefined): number {
  return (items ?? []).filter((i) => i.kind === "decision").length;
}
