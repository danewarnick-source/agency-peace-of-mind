/**
 * Home "Already assigned" companion + honest automation heartbeat.
 * Counts come from the existing obligation engine — not a second queue.
 */
import { addDaysYmd, daysBetweenYmd, denverYmd } from "../admin-home-data.ts";
import { sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";
import type { EvaluateInput, InstanceSnapshot, ObligationSnapshot } from "./escalation.ts";

export type AlreadyAssignedStrip = {
  renewalCount: number;
  staffNotified: boolean;
  dueInDays: number | null;
};

export type AutomationHeartbeat = {
  lastSuccessfulCheckAt: string | null;
  lastFailedAt: string | null;
  status: "ok" | "failed" | "unknown";
};

export function emptyAlreadyAssigned(): AlreadyAssignedStrip {
  return { renewalCount: 0, staffNotified: false, dueInDays: null };
}

export function emptyAutomationHeartbeat(): AutomationHeartbeat {
  return { lastSuccessfulCheckAt: null, lastFailedAt: null, status: "unknown" };
}

export function isRenewalClock(ob: ObligationSnapshot | undefined): boolean {
  if (!ob) return false;
  const key = (ob.key ?? "").toLowerCase();
  const title = (ob.title ?? "").toLowerCase();
  if (key.includes("renewal") || title.includes("renewal")) return true;
  const entry = sowCatalogEntryByKey(ob.key ?? "");
  if (!entry) return title.includes("annual") || key.includes("annual");
  return entry.due_rule.kind === "cert_expiration" || entry.due_rule.kind === "hire_anniversary";
}

function openAssigned(instance: InstanceSnapshot): boolean {
  if (instance.status !== "pending" && instance.status !== "overdue") return false;
  return !!instance.assignee_staff_id;
}

export function buildAlreadyAssigned(
  input: Pick<EvaluateInput, "obligations" | "instances" | "now">,
  decisionInstanceIds: Set<string> = new Set(),
  windowDays = 30,
): AlreadyAssignedStrip {
  const nowYmd = denverYmd(input.now);
  const windowEnd = addDaysYmd(nowYmd, windowDays);
  const byId = new Map(input.obligations.map((o) => [o.id, o]));
  const assigned = input.instances.filter((inst) => {
    if (!openAssigned(inst)) return false;
    if (decisionInstanceIds.has(inst.id)) return false;
    const ob = byId.get(inst.obligation_id);
    if (!isRenewalClock(ob)) return false;
    const dueYmd = denverYmd(new Date(inst.due_at));
    if (dueYmd < nowYmd || dueYmd > windowEnd) return false;
    return true;
  });
  if (assigned.length === 0) return emptyAlreadyAssigned();
  return {
    renewalCount: assigned.length,
    staffNotified: true,
    dueInDays: windowDays,
  };
}

export function formatAlreadyAssigned(strip: AlreadyAssignedStrip): string | null {
  if (strip.renewalCount <= 0) return null;
  const n = strip.renewalCount;
  const renewals = `${n} renewal${n === 1 ? "" : "s"}`;
  const notified = strip.staffNotified ? "Staff notified" : "Staff not notified";
  const due =
    strip.dueInDays != null && strip.dueInDays >= 0
      ? `Due in ${strip.dueInDays} days`
      : "Due date unset";
  return `${renewals} · ${notified} · ${due}`;
}

export function automationHeartbeatFrom(args: {
  lastSuccessfulCheckAt?: string | null;
  lastFailedAt?: string | null;
}): AutomationHeartbeat {
  const lastSuccessfulCheckAt = args.lastSuccessfulCheckAt ?? null;
  const lastFailedAt = args.lastFailedAt ?? null;
  if (lastSuccessfulCheckAt) {
    return { lastSuccessfulCheckAt, lastFailedAt, status: "ok" };
  }
  if (lastFailedAt) {
    return { lastSuccessfulCheckAt: null, lastFailedAt, status: "failed" };
  }
  return emptyAutomationHeartbeat();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatAutomationLine(hb: AutomationHeartbeat): string {
  if (hb.status === "ok" && hb.lastSuccessfulCheckAt) {
    return `Automation: Last successful check ${formatWhen(hb.lastSuccessfulCheckAt)}`;
  }
  if (hb.status === "failed" && hb.lastFailedAt) {
    return `Automation: Last check failed ${formatWhen(hb.lastFailedAt)} — retry pending`;
  }
  return "Automation: Last successful check unknown";
}

export function daysUntilDue(dueAt: string, now: Date): number {
  return daysBetweenYmd(denverYmd(now), denverYmd(new Date(dueAt)));
}
