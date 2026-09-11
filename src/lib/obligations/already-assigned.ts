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

/** Stable recurrence_key on notifications.type=escalation — the nightly job log. */
export const AUTOMATION_HEARTBEAT_RECURRENCE_KEY = "automation_heartbeat";

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
  if (lastSuccessfulCheckAt && lastFailedAt) {
    const successMs = Date.parse(lastSuccessfulCheckAt);
    const failedMs = Date.parse(lastFailedAt);
    if (!Number.isNaN(failedMs) && (Number.isNaN(successMs) || failedMs > successMs)) {
      return { lastSuccessfulCheckAt, lastFailedAt, status: "failed" };
    }
    return { lastSuccessfulCheckAt, lastFailedAt, status: "ok" };
  }
  if (lastSuccessfulCheckAt) {
    return { lastSuccessfulCheckAt, lastFailedAt, status: "ok" };
  }
  if (lastFailedAt) {
    return { lastSuccessfulCheckAt: null, lastFailedAt, status: "failed" };
  }
  return emptyAutomationHeartbeat();
}

function tableMissing(message: string | undefined): boolean {
  return (
    !!message && /does not exist|schema cache|relation|could not find the table/i.test(message)
  );
}

/** Read the existing nightly job row. Does not invent a time when none exists. */
export async function loadAutomationHeartbeat(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
): Promise<AutomationHeartbeat> {
  const { data, error } = await supabase
    .from("notifications")
    .select("body, resolved_at, next_remind_at")
    .eq("organization_id", organizationId)
    .eq("type", "escalation")
    .eq("recurrence_key", AUTOMATION_HEARTBEAT_RECURRENCE_KEY)
    .maybeSingle();
  if (error) {
    if (tableMissing(error.message)) return emptyAutomationHeartbeat();
    throw new Error(error.message);
  }
  const row = data as {
    body?: string | null;
    resolved_at?: string | null;
    next_remind_at?: string | null;
  } | null;
  if (!row) return emptyAutomationHeartbeat();
  const lastSuccessfulCheckAt = row.resolved_at ?? null;
  const lastFailedAt = row.body === "failed" ? (row.next_remind_at ?? null) : null;
  return automationHeartbeatFrom({ lastSuccessfulCheckAt, lastFailedAt });
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
