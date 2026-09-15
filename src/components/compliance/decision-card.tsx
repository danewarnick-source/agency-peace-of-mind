import type { Decision, DecisionActionKind } from "@/lib/obligations/this-week";
import { decorateDecision } from "@/lib/obligations/this-week";
import { OVERRIDE_STATE_LABEL, OVERRIDE_STILL_REQUIRED } from "@/lib/obligations/overrides";
import { cn } from "@/lib/utils";
import "./decision-card.css";

function urgencyBar(urgency: Decision["urgency"]): string {
  if (urgency === "critical") return "var(--hive-danger)";
  if (urgency === "high") return "var(--hive-gold-hover)";
  return "var(--hive-ok)";
}

function pillTone(dueText: string): { bg: string; fg: string } {
  if (dueText === "Done") return { bg: "var(--hive-ok-soft)", fg: "var(--hive-ok-fg)" };
  if (dueText === "Today" || /overdue/i.test(dueText) || dueText === "Yesterday") {
    return { bg: "var(--hive-danger-soft)", fg: "var(--hive-danger-fg)" };
  }
  return { bg: "var(--hive-gold-soft)", fg: "var(--hive-on-gold)" };
}

export function DecisionCard({
  item,
  done = false,
  reviewing = false,
  viewerUserId,
  onAction,
  onRecordOverride,
}: {
  item: Decision;
  done?: boolean;
  reviewing?: boolean;
  viewerUserId?: string | null;
  onAction: (kind: DecisionActionKind, decision: "approved" | "rejected" | "open") => void;
  onRecordOverride?: () => void;
}) {
  const decorated = decorateDecision(item, { viewerUserId });
  const headline = decorated.headline ?? decorated.title;
  const dueText = done ? "Done" : (decorated.dueText ?? "Before next review");
  const why = decorated.why ?? "";
  const ownerText = decorated.ownerText ?? "You";
  const ifMissed = decorated.ifMissed ?? "Part IV finding";
  const action = decorated.action ?? { label: "Log a plan", kind: "log_plan" as const };
  const pill = pillTone(dueText);

  return (
    <li
      data-testid="decision-card"
      className={cn("act", done && "act-done")}
      style={{
        background: "var(--hive-surface)",
        borderColor: "var(--hive-border)",
        borderLeftColor: urgencyBar(decorated.urgency),
        color: "var(--hive-text)",
      }}
    >
      <div className="act-head">
        <div
          data-testid="decision-headline"
          className="act-headline"
          style={{ color: "var(--hive-text)" }}
        >
          {headline}
        </div>
        <span
          data-testid="decision-due"
          className="act-pill"
          style={{ background: pill.bg, color: pill.fg }}
        >
          {dueText}
        </span>
      </div>
      <p data-testid="decision-why" className="act-why" style={{ color: "var(--hive-text-muted)" }}>
        {why}
      </p>
      {item.overridden ? (
        <p
          data-testid="override-state"
          className="act-why"
          style={{ color: "var(--hive-gold-hover)" }}
        >
          {OVERRIDE_STATE_LABEL}
          {item.overrideUntil ? ` until ${item.overrideUntil}` : ""}. {OVERRIDE_STILL_REQUIRED}
        </p>
      ) : null}
      <div className="act-meta" style={{ color: "var(--hive-text-muted)" }}>
        <span data-testid="decision-owner">Owner: {ownerText}</span>
        <span data-testid="decision-if-missed">If missed: {ifMissed}</span>
      </div>
      {done ? null : action.kind === "approve_plan" ? (
        <div data-testid="decision-action" className="flex flex-wrap gap-2">
          <button
            type="button"
            className="act-btn hive-gold-btn"
            disabled={reviewing}
            onClick={() => onAction("approve_plan", "approved")}
          >
            Approve
          </button>
          <button
            type="button"
            className="act-btn hive-ghost-btn"
            disabled={reviewing}
            onClick={() => onAction("approve_plan", "rejected")}
          >
            Reject
          </button>
        </div>
      ) : (
        <div data-testid="decision-action" className="flex flex-wrap gap-2">
          <button
            type="button"
            className="act-btn hive-gold-btn"
            onClick={() => onAction(action.kind, "open")}
          >
            {action.label}
          </button>
          {onRecordOverride ? (
            <button type="button" className="act-btn hive-ghost-btn" onClick={onRecordOverride}>
              Record override
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}
