// Pure conflict-engine for the Phase 2 scheduler.
// Given a set of shifts (already in range) + a rule_settings map + side context
// (cert expirations, trainings, staff DOBs, weekly target progress), it returns
// a flat list of conflicts tagged by severity. The board, ShiftCard, and the
// create dialog all consume the same list — no UI logic lives here.

import { isDailyCode } from "./code-colors";

export type ConflictSeverity = "hard" | "policy_block" | "policy_warn" | "warn";
export type RuleMode = "off" | "warn" | "block";

export type PolicyRuleCode =
  | "expired_cert"
  | "client_training_missing"
  | "hhs_under_21"
  | "two_to_one_ratio"
  | "over_16h_continuous"
  | "under_8h_rest"
  | "over_ot_threshold"
  | "dsi_over_6h"
  | "sl_overnight_no_awake";

export const POLICY_RULES: Array<{
  code: PolicyRuleCode;
  label: string;
  description: string;
  default: RuleMode;
}> = [
  { code: "expired_cert",           label: "Expired or missing required certification", description: "Block staff whose required cert lapses before the shift date.", default: "warn" },
  { code: "client_training_missing", label: "Client-specific training incomplete",      description: "Warn when a staff member lacks training for that client.",         default: "warn" },
  { code: "hhs_under_21",            label: "Staff under 21 on HHS",                    description: "Host-home staff must be at least 21.",                              default: "block" },
  { code: "two_to_one_ratio",        label: "Second staff on same client+time (2:1)",   description: "2:1 staffing requires a documented rights modification.",          default: "warn" },
  { code: "over_16h_continuous",     label: "Continuous work exceeds 16h",              description: "Long stretches without a break.",                                   default: "warn" },
  { code: "under_8h_rest",           label: "Less than 8h rest before next shift",      description: "Back-to-back shifts with insufficient recovery time.",              default: "warn" },
  { code: "over_ot_threshold",       label: "Projected week over OT threshold",         description: "Scheduled hours this week exceed the configured threshold.",        default: "warn" },
  { code: "dsi_over_6h",             label: "DSI shift longer than 6 hours",            description: "DSI is an atomic 1:1 visit; long blocks are unusual.",              default: "warn" },
  { code: "sl_overnight_no_awake",   label: "SL overnight without awake support",       description: "Asleep time isn't billable on SLH/SLN — confirm awake support.",   default: "warn" },
];

export type Shift = {
  id: string;
  staff_id: string | null;
  client_id: string;
  service_code: string | null;
  starts_at: string;
  ends_at: string;
  parent_shift_id: string | null;
  is_awake_overnight: boolean | null;
  status: string;
  override_reason?: string | null;
};

export type ConflictContext = {
  rules: Partial<Record<PolicyRuleCode, RuleMode>>;
  otThresholdHours: number;
  staff: Record<string, {
    active: boolean;
    dob?: string | null;
    expiredCertCodes?: string[];        // service codes the staff is NOT cert-current for
    missingTrainingClientIds?: string[];
  }>;
  weeklyTargetPctByClientCode?: Record<string, number>; // key = `${clientId}|${code}` → e.g. 1.3 = 130%
};

export type Conflict = {
  shiftId: string;
  severity: ConflictSeverity;
  code: string;
  message: string;
};

function mode(ctx: ConflictContext, code: PolicyRuleCode): RuleMode {
  return ctx.rules[code] ?? POLICY_RULES.find(r => r.code === code)?.default ?? "warn";
}

function policySeverity(m: RuleMode): ConflictSeverity | null {
  if (m === "off") return null;
  if (m === "block") return "policy_block";
  return "policy_warn";
}

function overlaps(a: Shift, b: Shift): boolean {
  return new Date(a.starts_at).getTime() < new Date(b.ends_at).getTime()
      && new Date(b.starts_at).getTime() < new Date(a.ends_at).getTime();
}

function hoursBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 3_600_000;
}

function ageOn(dobIso: string | null | undefined, onIso: string): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso); const on = new Date(onIso);
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

function isoWeekKey(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0=Sun
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return `${mon.getUTCFullYear()}-${mon.getUTCMonth() + 1}-${mon.getUTCDate()}`;
}

export function evaluateShifts(shifts: Shift[], ctx: ConflictContext): Conflict[] {
  const out: Conflict[] = [];
  const byId = new Map(shifts.map(s => [s.id, s]));

  // ---- HARD rules ----
  for (let i = 0; i < shifts.length; i++) {
    const a = shifts[i];
    if (a.status === "cancelled" || a.status === "declined") continue;

    // staff inactive (open shifts have no staff yet — skip)
    const staff = a.staff_id ? ctx.staff[a.staff_id] : undefined;
    if (staff && staff.active === false) {
      out.push({ shiftId: a.id, severity: "hard", code: "staff_inactive", message: "Staff is inactive." });
    }

    // segment-specific
    if (a.parent_shift_id) {
      if (isDailyCode(a.service_code)) {
        out.push({ shiftId: a.id, severity: "hard", code: "daily_on_segment",
          message: `${a.service_code} is a daily-unit code and cannot be used on a 1:1 segment.` });
      }
      const parent = byId.get(a.parent_shift_id);
      if (parent) {
        const inside =
          new Date(a.starts_at).getTime() >= new Date(parent.starts_at).getTime() &&
          new Date(a.ends_at).getTime()   <= new Date(parent.ends_at).getTime();
        if (!inside) {
          out.push({ shiftId: a.id, severity: "hard", code: "segment_outside_parent",
            message: "Segment times extend beyond its parent shift." });
        }
      }
    }

    for (let j = i + 1; j < shifts.length; j++) {
      const b = shifts[j];
      if (b.status === "cancelled" || b.status === "declined") continue;
      if (!overlaps(a, b)) continue;

      // staff overlap — except legitimate segment ↔ parent pairing
      if (a.staff_id && b.staff_id && a.staff_id === b.staff_id) {
        const isSegmentPair =
          (a.parent_shift_id === b.id) || (b.parent_shift_id === a.id);
        if (!isSegmentPair) {
          const msg = "Same staff scheduled for overlapping shifts.";
          out.push({ shiftId: a.id, severity: "hard", code: "staff_overlap", message: msg });
          out.push({ shiftId: b.id, severity: "hard", code: "staff_overlap", message: msg });
        }
      }

      // same client + same service code double-book
      if (a.client_id === b.client_id && a.service_code && a.service_code === b.service_code
          && !a.parent_shift_id && !b.parent_shift_id) {
        const msg = `Client double-booked for ${a.service_code}.`;
        out.push({ shiftId: a.id, severity: "hard", code: "client_double_book", message: msg });
        out.push({ shiftId: b.id, severity: "hard", code: "client_double_book", message: msg });
      }

      // 2:1 ratio (policy) — same client+time, different staff
      if (a.client_id === b.client_id && a.staff_id !== b.staff_id) {
        const sev = policySeverity(mode(ctx, "two_to_one_ratio"));
        if (sev) {
          const msg = "Second staff on same client + time — 2:1 staffing requires a documented rights modification.";
          out.push({ shiftId: a.id, severity: sev, code: "two_to_one_ratio", message: msg });
          out.push({ shiftId: b.id, severity: sev, code: "two_to_one_ratio", message: msg });
        }
      }
    }
  }

  // ---- POLICY rules per-shift ----
  for (const s of shifts) {
    if (s.status === "cancelled" || s.status === "declined") continue;
    const staff = ctx.staff[s.staff_id];
    const dur = hoursBetween(s.starts_at, s.ends_at);
    const code = (s.service_code ?? "").toUpperCase();

    // expired cert
    if (staff?.expiredCertCodes?.includes(code)) {
      const sev = policySeverity(mode(ctx, "expired_cert"));
      if (sev) out.push({ shiftId: s.id, severity: sev, code: "expired_cert",
        message: `Required certification for ${code} is missing or expired.` });
    }
    // client training
    if (staff?.missingTrainingClientIds?.includes(s.client_id)) {
      const sev = policySeverity(mode(ctx, "client_training_missing"));
      if (sev) out.push({ shiftId: s.id, severity: sev, code: "client_training_missing",
        message: "Client-specific training not yet completed." });
    }
    // HHS under 21
    if (code === "HHS") {
      const age = ageOn(staff?.dob, s.starts_at);
      if (age !== null && age < 21) {
        const sev = policySeverity(mode(ctx, "hhs_under_21"));
        if (sev) out.push({ shiftId: s.id, severity: sev, code: "hhs_under_21",
          message: `Staff is ${age} — HHS requires age 21+.` });
      }
    }
    // >16h continuous
    if (dur > 16) {
      const sev = policySeverity(mode(ctx, "over_16h_continuous"));
      if (sev) out.push({ shiftId: s.id, severity: sev, code: "over_16h_continuous",
        message: `Continuous shift of ${dur.toFixed(1)}h exceeds 16h.` });
    }
    // DSI > 6h
    if (code === "DSI" && dur > 6) {
      const sev = policySeverity(mode(ctx, "dsi_over_6h"));
      if (sev) out.push({ shiftId: s.id, severity: sev, code: "dsi_over_6h",
        message: `DSI shift is ${dur.toFixed(1)}h — typical max is 6h.` });
    }
    // SL overnight without awake confirmation
    if ((code === "SLH" || code === "SLN") && !s.is_awake_overnight) {
      const sh = new Date(s.starts_at).getUTCHours();
      const eh = new Date(s.ends_at).getUTCHours();
      const touchesOvernight = sh >= 23 || sh < 6 || eh >= 23 || eh < 6 || dur >= 8;
      if (touchesOvernight) {
        const sev = policySeverity(mode(ctx, "sl_overnight_no_awake"));
        if (sev) out.push({ shiftId: s.id, severity: sev, code: "sl_overnight_no_awake",
          message: "Asleep time isn't billable on Supported Living — confirm awake support." });
      }
    }
    // weekly target overshoot (warn-only)
    if (s.service_code) {
      const pct = ctx.weeklyTargetPctByClientCode?.[`${s.client_id}|${code}`];
      if (pct !== undefined && pct >= 1.2) {
        out.push({ shiftId: s.id, severity: "warn", code: "target_over_120",
          message: `Client weekly target for ${code} already at ${Math.round(pct * 100)}%.` });
      }
    }
  }

  // ---- POLICY rules per-staff pairs (rest, OT) ----
  const byStaff = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (s.status === "cancelled" || s.status === "declined") continue;
    const arr = byStaff.get(s.staff_id) ?? [];
    arr.push(s); byStaff.set(s.staff_id, arr);
  }
  for (const [, arr] of byStaff) {
    arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1], cur = arr[i];
      if (cur.parent_shift_id === prev.id || prev.parent_shift_id === cur.id) continue;
      const rest = hoursBetween(prev.ends_at, cur.starts_at);
      if (new Date(cur.starts_at) >= new Date(prev.ends_at) && rest < 8) {
        const sev = policySeverity(mode(ctx, "under_8h_rest"));
        if (sev) out.push({ shiftId: cur.id, severity: sev, code: "under_8h_rest",
          message: `Only ${rest.toFixed(1)}h rest after previous shift.` });
      }
    }
    // OT per ISO week
    const hoursByWeek = new Map<string, number>();
    for (const s of arr) {
      if (s.parent_shift_id) continue; // segments live inside parent
      const k = isoWeekKey(s.starts_at);
      hoursByWeek.set(k, (hoursByWeek.get(k) ?? 0) + hoursBetween(s.starts_at, s.ends_at));
    }
    for (const s of arr) {
      const total = hoursByWeek.get(isoWeekKey(s.starts_at)) ?? 0;
      if (total > ctx.otThresholdHours) {
        const sev = policySeverity(mode(ctx, "over_ot_threshold"));
        if (sev) out.push({ shiftId: s.id, severity: sev, code: "over_ot_threshold",
          message: `Projected ${total.toFixed(1)}h this week (threshold ${ctx.otThresholdHours}h).` });
      }
    }
  }

  return out;
}

export function summarizeBySeverity(conflicts: Conflict[]) {
  let hard = 0, block = 0, warn = 0;
  for (const c of conflicts) {
    if (c.severity === "hard") hard++;
    else if (c.severity === "policy_block") block++;
    else warn++;
  }
  return { hard, block, warn, total: conflicts.length };
}

export function conflictsForShift(conflicts: Conflict[], shiftId: string): Conflict[] {
  return conflicts.filter(c => c.shiftId === shiftId);
}

export function worstSeverity(conflicts: Conflict[]): ConflictSeverity | null {
  if (conflicts.some(c => c.severity === "hard")) return "hard";
  if (conflicts.some(c => c.severity === "policy_block")) return "policy_block";
  if (conflicts.some(c => c.severity === "policy_warn")) return "policy_warn";
  if (conflicts.some(c => c.severity === "warn")) return "warn";
  return null;
}
