
## Goal

Make the existing client MAR (`MarEmarTab` in `src/components/workspace/mar-emar-tab.tsx`) behave as one shared, realtime, append-only record across every staff dashboard viewing the same client — without altering layout, tokens, or unrelated component logic.

The `emar_logs` table already supports this shape (append-only inserts, `staff_id`/`staff_name`/`created_at` per row, `recorded_in` for job-code context, no unique index on `(medication_id, scheduled_for)`). Changes are scoped to the read/realtime/render layer plus job-code stamping.

## Scope of change (one file unless noted)

`src/components/workspace/mar-emar-tab.tsx` only, plus a tiny addition to the submit payload so it stamps the active shift's job code.

No DB migration. No design-token edits. No changes to `emar-tab.tsx`, `mar-calendar.tsx`, or `dashboard.emar.tsx`.

## 1. Realtime sync across all dashboards

Inside `MarEmarTab`, add a `useEffect` that opens a Supabase realtime channel scoped to this client:

```text
supabase
  .channel(`emar_logs:client:${clientId}`)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'emar_logs',
        filter: `client_id=eq.${clientId}` },
      () => {
        qc.invalidateQueries({ queryKey: ['mar-logs-today',  clientId, orgId] });
        qc.invalidateQueries({ queryKey: ['mar-logs-month',  clientId, orgId] });
        qc.invalidateQueries({ queryKey: ['mar-logs-cal',    clientId] });
      })
  .subscribe();
```

Cleanup removes the channel on unmount / clientId change. This is the only mechanism needed — every dashboard viewing the same client refetches the moment any staff inserts a row. (`emar_logs` is already in the default realtime publication for this project; if a published-tables check shows it missing, the plan adds a one-line migration to `ALTER PUBLICATION supabase_realtime ADD TABLE public.emar_logs`.)

## 2. Append-only, multi-entry per slot

Currently `passes` does `todayLogs.find(...)` and treats the first match as "the log". Change it to:

- Collect **all** logs for a `(medication_id, scheduled_for ±60s)` slot, sorted by `created_at` ascending → `p.history: EmarLog[]`.
- `p.latest = history[history.length - 1] ?? undefined`.
- All existing references to `p.log` keep working by aliasing `p.log = p.latest`. No layout change.

Submit path (`submitAdmin`) is unchanged — it already INSERTs a new row every time, which is exactly the immutable-append requirement.

## 3. Lock rule (only "Administered" locks)

Replace the current `const done = !!p.log` lock with:

```text
const isLocked = p.latest?.status === 'administered';
```

- If latest status is `administered` → hide the "Record Pass" button (current behavior for `done`), keep the green "Administered" badge. Lock holds until the slot's scheduled time has passed; the next scheduled `scheduled_for` for that med is naturally a new pass row, so the "next dosage window" is unlocked automatically.
- If latest status is `refused | omitted | missed` → the row stays unlocked: the "Record Pass" button remains visible (re-labelled "Update status" when `p.history.length > 0`) so any staff — original or subsequent — can append a new entry. Submitting again just inserts another `emar_logs` row.
- Empty slot → unchanged ("Record Pass" / "Document Now" / "Log PRN").

Visual treatment of badges, colors, spacing, and the existing "Window Passed" amber pill are not modified.

## 4. Job-code stamping on every entry

Each appended row must carry the job code the staff is currently working under.

- Read the active shift via the existing `useActiveShift` / `useTodayShift` hook (already imported elsewhere in the workspace). Pull `service_type_code` (e.g. `HHS`, `DSI`, `DSG`, `RHS`, …).
- Pass it into `submitAdmin` and write it to `emar_logs.recorded_in`. The column's CHECK constraint currently allows only `dsi | hhs | general`; to preserve the precise code (DSG, RHS, RP3, etc.) without a constraint edit, store the raw service code in `notes` as a prefix (`[code:DSG] …existing notes`) and continue to set `recorded_in` to the closest allowed bucket (`hhs` for HHS variants, otherwise `dsi`, fallback `general`). This is a non-breaking, additive use of existing columns — no migration.
- If the user has no active shift, stamp `general` and prefix `[code:none]`.

## 5. Per-row chronological history strip (immutable)

Inside each pass `<li>`, when `p.history.length > 0`, render a compact history list **using existing classes only** (same `text-xs text-muted-foreground` pattern already used for instructions):

```text
[09:02 HH:MM] Refused — Maria G. · HHS
[11:14 HH:MM] Administered — Devon P. · DSI ✓
```

- Strictly read-only — no edit/delete affordances.
- Each line = one `emar_logs` row, ordered by `created_at` ascending.
- The job code shown is parsed from the `[code:XXX]` prefix in `notes` (falling back to `recorded_in`).
- The existing single-status badge keeps showing the latest state above the strip; the strip simply lists prior states underneath. Layout container, spacing, and tokens unchanged.

## 6. RLS / writability

No policy change required:
- `members insert emar` already permits any org member to INSERT (subject to `staff_id = auth.uid()`).
- `managers update/delete emar` keeps overrides admin-only — staff cannot mutate prior rows, which enforces "un-editable" at the database level.

## What we are explicitly NOT changing

- No edits to design tokens, Tailwind classes, card structure, dialog layout, the History tab table, or the calendar view.
- No edits to `emar-tab.tsx`, `mar-calendar.tsx`, `dashboard.emar.tsx`, or `dashboard.admin.emar-audit.tsx`.
- No schema migration (only optional one-liner to add `emar_logs` to the realtime publication if a check shows it missing).
- No new components, no new routes.

## Verification

1. Open the same client's MAR in two browser windows as different staff.
2. Window A submits "Refused" at 09:00 → both windows show the Refused badge and a one-line history strip; "Record Pass" button stays visible in both windows.
3. Window B submits "Administered" for the same slot → both windows update to green "Administered", button disappears, history strip now shows both rows in order, each tagged with the submitting staff + job code.
4. Confirm `emar_logs` contains two rows for the slot (no UPDATE) and that staff attempting to PATCH/DELETE a prior row is blocked by RLS.
