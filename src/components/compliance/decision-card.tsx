import { PI_THEME } from "@/lib/pi-theme";
import type { Decision, DecisionActionKind } from "@/lib/obligations/this-week";
import { decorateDecision } from "@/lib/obligations/this-week";
import { cn } from "@/lib/utils";
import "./decision-card.css";

function urgencyBar(urgency: Decision["urgency"]): string {
  if (urgency === "critical") return PI_THEME.red;
  if (urgency === "high") return PI_THEME.amber;
  return PI_THEME.ok;
}

function pillTone(dueText: string): { bg: string; fg: string } {
  if (dueText === "Done") return { bg: "rgba(95, 174, 127, 0.16)", fg: PI_THEME.ok };
  if (dueText === "Today" || /overdue/i.test(dueText) || dueText === "Yesterday") {
    return { bg: "rgba(224, 138, 128, 0.16)", fg: PI_THEME.red };
  }
  return { bg: PI_THEME.goldSoft, fg: PI_THEME.amber };
}

export function DecisionCard({
  item,
  done = false,
  reviewing = false,
  onAction,
}: {
  item: Decision;
  done?: boolean;
  reviewing?: boolean;
  onAction: (kind: DecisionActionKind, decision: "approved" | "rejected" | "open") => void;
}) {
  const decorated = decorateDecision(item);
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
        background: PI_THEME.heroTileBg,
        borderColor: PI_THEME.hairlines.faint,
        borderLeftColor: urgencyBar(decorated.urgency),
        color: PI_THEME.cream,
      }}
    >
      <div className="act-head">
        <div data-testid="decision-headline" className="act-headline" style={{ color: PI_THEME.cream }}>
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
      <p data-testid="decision-why" className="act-why" style={{ color: PI_THEME.c70 }}>
        {why}
      </p>
      <div className="act-meta" style={{ color: PI_THEME.c50 }}>
        <span data-testid="decision-owner">Owner: {ownerText}</span>
        <span data-testid="decision-if-missed">If missed: {ifMissed}</span>
      </div>
      {done ? null : action.kind === "approve_plan" ? (
        <div data-testid="decision-action" className="flex flex-wrap gap-2">
          <button
            type="button"
            className="act-btn"
            disabled={reviewing}
            style={{
              background: PI_THEME.buttons.primaryBg,
              color: PI_THEME.buttons.primaryFg,
              boxShadow: PI_THEME.buttons.primaryShadow,
            }}
            onClick={() => onAction("approve_plan", "approved")}
          >
            Approve
          </button>
          <button
            type="button"
            className="act-btn"
            disabled={reviewing}
            style={{
              background: PI_THEME.buttons.secondaryBg,
              color: PI_THEME.buttons.secondaryFg,
              border: `1px solid ${PI_THEME.buttons.secondaryBorder}`,
            }}
            onClick={() => onAction("approve_plan", "rejected")}
          >
            Reject
          </button>
        </div>
      ) : (
        <div data-testid="decision-action">
          <button
            type="button"
            className="act-btn"
            style={{
              background: PI_THEME.buttons.primaryBg,
              color: PI_THEME.buttons.primaryFg,
              boxShadow: PI_THEME.buttons.primaryShadow,
            }}
            onClick={() => onAction(action.kind, "open")}
          >
            {action.label}
          </button>
        </div>
      )}
    </li>
  );
}
