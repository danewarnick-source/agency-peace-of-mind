// Shared save paths for evv_timesheets record edits — used by BOTH the full
// record detail view (record-detail-sheet.tsx) and inline quick-edit cells
// in the records table (records-tab.tsx), so every edit surface writes the
// exact same audit trail (edit_audit_history_log / edited_by_admin_name /
// edited_at, or manager_note_by_name / manager_note_at). Do not duplicate
// this logic in a second save path — call these functions instead.
import { supabase } from "@/integrations/supabase/client";

export type AuditEntry = {
  timestamp: string;
  admin: string;
  field_changed: string;
  old_value: string;
  new_value: string;
};

export type AuditableRow = {
  id: string;
  edit_audit_history_log: AuditEntry[] | null;
  [key: string]: unknown;
};

export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// clock_in_timestamp/clock_out_timestamp round-trip through a minute-precision
// <input type="datetime-local"> in the inline editor, so the original value
// (which usually carries real seconds/ms) never equals the round-tripped
// value even when the user didn't touch it. Compare these fields at minute
// precision so an unedited round-trip isn't reported as a change.
const MINUTE_PRECISION_FIELDS = new Set(["clock_in_timestamp", "clock_out_timestamp"]);

function toComparableValue(field: string, v: unknown): string {
  if (v == null || v === "") return "";
  if (MINUTE_PRECISION_FIELDS.has(field)) {
    const d = new Date(String(v));
    if (Number.isFinite(d.getTime())) {
      d.setSeconds(0, 0);
      return d.toISOString();
    }
  }
  return String(v);
}

export function diffVal(field: string, v: unknown): string {
  if (v == null || v === "") return "(empty)";
  if (field.includes("clock_")) return new Date(String(v)).toLocaleString();
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/**
 * Diffs `updates` against `row`, appends to edit_audit_history_log, and
 * stamps is_edited_by_admin / edited_by / edited_by_admin_name / edited_at.
 * Returns null (no-op, nothing written) when nothing actually changed.
 */
export async function saveRecordFields(params: {
  row: AuditableRow;
  updates: Record<string, unknown>;
  adminName: string;
  userId: string | null;
}): Promise<{ audit: AuditEntry[] } | null> {
  const { row, updates, adminName, userId } = params;
  const nowIso = new Date().toISOString();

  const audit: AuditEntry[] = [];
  for (const [field, newV] of Object.entries(updates)) {
    const oldV = row[field];
    const a = toComparableValue(field, oldV);
    const b = toComparableValue(field, newV);
    if (a !== b) {
      audit.push({
        timestamp: nowIso,
        admin: adminName,
        field_changed: field,
        old_value: diffVal(field, oldV),
        new_value: diffVal(field, newV),
      });
    }
  }
  if (audit.length === 0) return null;

  const history = [...(row.edit_audit_history_log ?? []), ...audit];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("evv_timesheets") as any)
    .update({
      ...updates,
      is_edited_by_admin: true,
      edited_by: userId,
      edited_by_admin_name: adminName,
      edited_at: nowIso,
      edit_audit_history_log: history,
    })
    .eq("id", row.id);
  if (error) throw error;

  return { audit };
}

/**
 * Manager/admin note — a separate field from shift_note_text (the
 * caregiver's own note), tracked with its own by/at columns rather than
 * being merged into edit_audit_history_log.
 */
export async function saveManagerNote(params: {
  rowId: string;
  managerNote: string;
  adminName: string;
  userId: string | null;
}): Promise<void> {
  const { rowId, managerNote, adminName, userId } = params;
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("evv_timesheets") as any)
    .update({
      manager_note_text: managerNote || null,
      manager_note_by: userId,
      manager_note_by_name: adminName,
      manager_note_at: nowIso,
    })
    .eq("id", rowId);
  if (error) throw error;
}
