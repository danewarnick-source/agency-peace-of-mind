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
};

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
};

export const FORM_CATEGORIES = [
  { value: "general", label: "General (Records → Forms only)" },
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
