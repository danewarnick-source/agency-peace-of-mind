// Shared helpers for the custom-forms feature — pure functions safe on both
// client and server. No supabase, no fetch.

export type Frequency = "as_needed" | "daily" | "weekly" | "monthly" | "quarterly" | "annually";

export type Schedule = {
  weekday?: number; // 1=Mon … 7=Sun (ISO)
  day_of_month?: number | "last";
  month_of_year?: number; // 1-12
  day_of_year?: number; // day-of-month within the chosen month
  time?: string; // "HH:MM" 24h
};

export type FieldType =
  | "section"
  | "short_text"
  | "paragraph"
  | "dropdown"
  | "checkboxes"
  | "yes_no"
  | "number"
  | "date"
  | "time"
  | "rating"
  | "signature"
  | "photo"
  | "file"
  | "location"
  | "email"
  | "phone";

export type ConditionOperator =
  | "is" | "is_not"
  | "lt" | "gt" | "eq"
  | "includes" | "excludes"
  | "answered" | "not_answered";

export type FieldCondition = {
  fieldId: string;
  operator: ConditionOperator;
  value?: string | number;
} | null;

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  instructions?: string; // for sections
  options?: string[]; // dropdown / checkboxes
  config?: {
    display?: "box" | "slider"; // number
    min?: number;
    max?: number;
    step?: number;
    scale?: number; // rating max stars
  };
  condition?: FieldCondition;
};

/** Returns true when the field has no condition or its condition is satisfied
 *  by the current answers. Sections are always visible. */
export function isFieldVisible(
  field: FormField,
  answers: Record<string, unknown>,
  allFields: FormField[],
): boolean {
  const c = field.condition;
  if (!c || !c.fieldId) return true;
  const ctrl = allFields.find((x) => x.id === c.fieldId);
  if (!ctrl) return true; // broken ref — show
  // Controller itself must be visible for downstream rule to count
  if (!isFieldVisible(ctrl, answers, allFields)) return false;
  const v = answers[c.fieldId];
  const isEmpty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  switch (c.operator) {
    case "answered": return !isEmpty;
    case "not_answered": return isEmpty;
    case "is": return String(v ?? "") === String(c.value ?? "");
    case "is_not": return String(v ?? "") !== String(c.value ?? "");
    case "lt": return typeof v === "number" && typeof c.value === "number" && v < c.value;
    case "gt": return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case "eq": return Number(v) === Number(c.value);
    case "includes": return Array.isArray(v) && v.includes(String(c.value));
    case "excludes": return Array.isArray(v) && !v.includes(String(c.value));
    default: return true;
  }
}

/** Self-heal: clear any condition whose controller no longer exists OR is now
 *  positioned at/after the dependent field (forward reference). */
export function sanitizeConditions(fields: FormField[]): FormField[] {
  return fields.map((f, idx) => {
    if (!f.condition) return f;
    const ctrlIdx = fields.findIndex((x) => x.id === f.condition!.fieldId);
    if (ctrlIdx === -1 || ctrlIdx >= idx || fields[ctrlIdx].type === "section") {
      return { ...f, condition: null };
    }
    return f;
  });
}

/** Operators available for a controlling field type. */
export function operatorsFor(type: FieldType): { value: ConditionOperator; label: string }[] {
  switch (type) {
    case "yes_no": return [{ value: "is", label: "is" }, { value: "is_not", label: "is not" }];
    case "number":
    case "rating": return [
      { value: "lt", label: "is less than" },
      { value: "gt", label: "is greater than" },
      { value: "eq", label: "equals" },
    ];
    case "dropdown": return [{ value: "is", label: "is" }, { value: "is_not", label: "is not" }];
    case "checkboxes": return [{ value: "includes", label: "includes" }, { value: "excludes", label: "does not include" }];
    default: return [{ value: "answered", label: "is answered" }, { value: "not_answered", label: "is not answered" }];
  }
}

export type FormSettings = {
  anonymous?: boolean;
  commenting?: boolean;
  allow_download?: boolean;
  allow_edit?: boolean;
  share_users?: string[];
  share_manager?: boolean;
  share_emails?: string[];
  notify_push?: boolean;
  notify_email?: boolean;
  submission_limit?: "unlimited" | "1_per_day" | "1_per_week" | "1_per_month" | "1_total";
  remind?: "off" | "3_days_before" | "weekly" | "daily";
  subcategory?: "application" | "independence" | "consent" | "pnp_attestation" | "other";
  /** Company-declared: this intake form is required to complete client intake.
   *  When true, saveForm syncs a `company_required` row into nectar_requirements
   *  (scope='hr_client_intake') so it appears on the client intake checklist. */
  required_for_intake?: boolean;
  /** Short company-authored description shown to staff in the runner and to
   *  auditors on the intake checklist. NEVER presented as authoritative. */
  purpose?: string;
  /** Admin-authored free-text describing how this form is used. Feeds the
   *  NECTAR routing-behavior proposal. Stored only — not yet read by any
   *  runtime destination. */
  usage_purpose?: string;
  /** Declared usage behavior for this form. Each behavior has a wired
   *  destination except per_shift_per_client_tracked (still pending). */
  routing_behavior?: RoutingBehavior;
  /** Last NECTAR proposal (for transparency). Stored so admins can see what
   *  was suggested even after they pick a different behavior. */
  routing_proposal?: { behavior: RoutingBehavior; rationale: string; at: string };
  /** Scope for a staff_mandate form. `per_staff` (default, wired now): the
   *  staffer completes once and it satisfies the mandate everywhere. The
   *  `per_staff_per_client` scope is not yet built; it is shown as a future
   *  option and currently behaves as `per_staff`. */
  mandate_scope?: "per_staff" | "per_staff_per_client";
  /** Enforcement strength for a staff_mandate form at the assignment
   *  checkpoint. `warn` (default) = non-blocking warning + proceed-anyway
   *  notification (existing behavior). `block` = assignment is blocked
   *  while unmet; admins/owners may override with a typed reason which is
   *  stored on the notification record. */
  mandate_enforcement?: "warn" | "block";
  /** Per-shift, per-client tracked-data routing (Stage 2 of 5).
   *  Captures targeting + enforcement choices for forms with
   *  routing_behavior='per_shift_per_client_tracked'. The choices are
   *  stored so config persists; the actual front-of-punch prompts and
   *  the Care-tab section are wired in later stages. Client targeting
   *  REUSES the existing all_clients / assigned_clients audience. */
  tracking_code_mode?: "all" | "specific";
  tracking_billing_codes?: string[];
  tracking_enforcement?: "optional" | "reminded" | "required_before_clockout" | "required_before_next_clockin";
};

export type RoutingBehavior =
  | "general_submission"
  | "notify_only"
  | "client_intake_required"
  | "one_time_attestation"
  | "staff_mandate"
  | "per_shift_per_client_tracked";

export const ROUTING_BEHAVIORS: Array<{
  value: RoutingBehavior;
  label: string;
  short: string;
  /** Plain-language note shown once a behavior is chosen. */
  implication: string;
  /** Is the destination/auto-check/gate already wired today? */
  wired: boolean;
}> = [
  {
    value: "general_submission",
    label: "General submission",
    short: "Just filed in Records → Forms.",
    implication: "Submissions are filed in Records → Forms. No notifications, no checklist, no gating.",
    wired: true,
  },
  {
    value: "notify_only",
    label: "Notify on submit",
    short: "Filed, and chosen people are notified when it's submitted.",
    implication: "Filed in Records → Forms and people you choose under Settings → Sharing are notified on each submission.",
    wired: true,
  },
  {
    value: "client_intake_required",
    label: "Client intake — required",
    short: "Satisfies a client intake checklist item.",
    implication: "Intake forms appear on the client intake checklist as a Company-required item. Configure under the Intake category (subcategory + required-for-intake). Submissions auto-check the corresponding checklist item.",
    wired: true,
  },
  {
    value: "one_time_attestation",
    label: "One-time staff attestation",
    short: "Each staff completes once; filed as a signed record.",
    implication: "Records a one-time attestation per staff and surfaces it as evidence. When mapped to a requirement, submission satisfies that checklist item.",
    wired: true,
  },
  {
    value: "staff_mandate",
    label: "Staff mandate before client work",
    short: "Every staff must complete before being scheduled with a client.",
    implication: "Warns admins if a staffer is assigned to client work without completing this form. Choosing Proceed anyway records an override and notifies admins.",
    wired: true,
  },
  {
    value: "per_shift_per_client_tracked",
    label: "Per-shift, per-client tracked data",
    short: "Recurring data tied to a client, viewed as a series.",
    implication: "Collects data on shifts that match the chosen client and billing-code filters; submissions are filed as normal. Enforcement prompts at clock-out / next clock-in and the client Care-tab series view are set up in later steps — for now the form just files.",
    wired: true,
  },
];

export const FORM_CATEGORIES = [
  { value: "general", label: "General (Records → Forms only)" },
  { value: "intake", label: "Client Intake" },
  { value: "timesheets", label: "Timesheets" },
  { value: "training", label: "Training Records" },
  { value: "incidents", label: "Incident Reports" },
  { value: "clients", label: "Client / Person Records" },
  { value: "hr", label: "HR / Personnel" },
  { value: "daily_logs", label: "Daily Logs" },
  { value: "compliance", label: "Compliance" },
  { value: "billing", label: "Billing" },
  { value: "scheduling", label: "Scheduling" },
] as const;

// ─── period key + due date helpers ─────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }

function isoWeek(d: Date): [number, number] {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return [target.getUTCFullYear(), week];
}

export function periodKeyFor(freq: Frequency, when: Date = new Date()): string | null {
  switch (freq) {
    case "daily": return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
    case "weekly": { const [y, w] = isoWeek(when); return `${y}-W${pad(w)}`; }
    case "monthly": return `${when.getFullYear()}-${pad(when.getMonth() + 1)}`;
    case "quarterly": return `${when.getFullYear()}-Q${Math.floor(when.getMonth() / 3) + 1}`;
    case "annually": return `${when.getFullYear()}`;
    case "as_needed": default: return null;
  }
}

export function dueDateFor(freq: Frequency, schedule: Schedule, when: Date = new Date()): Date | null {
  const y = when.getFullYear();
  const m = when.getMonth();
  switch (freq) {
    case "as_needed": return null;
    case "daily": {
      const [hh, mm] = (schedule.time ?? "23:59").split(":").map(Number);
      const d = new Date(when); d.setHours(hh || 23, mm || 59, 0, 0);
      return d;
    }
    case "weekly": {
      const target = schedule.weekday ?? 7; // 1..7
      const cur = when.getDay() === 0 ? 7 : when.getDay();
      const diff = target - cur; // can be negative — that means earlier this week (already past)
      const d = new Date(when); d.setDate(when.getDate() + diff); d.setHours(23, 59, 0, 0);
      return d;
    }
    case "monthly": {
      const last = new Date(y, m + 1, 0).getDate();
      const day = schedule.day_of_month === "last" ? last : Math.min(Number(schedule.day_of_month ?? last) || last, last);
      return new Date(y, m, day, 23, 59, 0, 0);
    }
    case "quarterly": {
      const qStartMonth = Math.floor(m / 3) * 3;
      const day = Number(schedule.day_of_month ?? 1) || 1;
      const last = new Date(y, qStartMonth + 1, 0).getDate();
      return new Date(y, qStartMonth, Math.min(day, last), 23, 59, 0, 0);
    }
    case "annually": {
      const mo = (Number(schedule.month_of_year ?? 1) || 1) - 1;
      const last = new Date(y, mo + 1, 0).getDate();
      const day = Math.min(Number(schedule.day_of_year ?? 1) || 1, last);
      return new Date(y, mo, day, 23, 59, 0, 0);
    }
  }
}

export function isOverdue(due: Date | null, now: Date = new Date()): boolean {
  return !!due && now.getTime() > due.getTime();
}

export function formatDue(due: Date | null): string {
  if (!due) return "Anytime";
  return due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function describeFrequency(freq: Frequency, schedule: Schedule): string {
  switch (freq) {
    case "as_needed": return "As needed";
    case "daily": return schedule.time ? `Daily by ${schedule.time}` : "Daily";
    case "weekly": {
      const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
      return `Weekly · ${days[(schedule.weekday ?? 7) - 1]}`;
    }
    case "monthly": return `Monthly · day ${schedule.day_of_month ?? "—"}`;
    case "quarterly": return `Quarterly · day ${schedule.day_of_month ?? 1} of the quarter`;
    case "annually": {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `Annually · ${months[(schedule.month_of_year ?? 1) - 1]} ${schedule.day_of_year ?? 1}`;
    }
  }
}

export function defaultFieldFor(type: FieldType): FormField {
  const id = `f_${Math.random().toString(36).slice(2, 10)}`;
  const base: FormField = { id, type, label: defaultLabel(type), required: false };
  if (type === "dropdown" || type === "checkboxes") base.options = ["Option 1", "Option 2"];
  if (type === "number") base.config = { display: "box", min: 0, max: 100, step: 1 };
  if (type === "rating") base.config = { scale: 5 };
  if (type === "section") base.instructions = "Add instructions for this section.";
  return base;
}

function defaultLabel(t: FieldType): string {
  const map: Record<FieldType, string> = {
    section: "Section heading",
    short_text: "Short text question",
    paragraph: "Paragraph question",
    dropdown: "Choose one",
    checkboxes: "Choose all that apply",
    yes_no: "Yes / No",
    number: "Number",
    date: "Date",
    time: "Time",
    rating: "Rating",
    signature: "Signature",
    photo: "Photo upload",
    file: "File upload",
    location: "Location (GPS)",
    email: "Email",
    phone: "Phone",
  };
  return map[t];
}
