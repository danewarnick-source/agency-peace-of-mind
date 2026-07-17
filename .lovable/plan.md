## Goal

Replace the 7-tab staff medications experience (MarEmarTab) with a single, simple, read-only-plus-log screen on the two staff-facing surfaces. Admin keeps MarEmarTab untouched.

## Scope

- **Replace on staff surfaces:**
  - `src/routes/dashboard.workspace.$clientId.tsx` — swap `<MarEmarTab .../>` → new `<StaffMedicationsPanel .../>`
  - `src/routes/dashboard.hhs-hub.$clientId.tsx` — same swap
- **Do not touch admin surface:**
  - `src/routes/dashboard.clients.$clientId.tsx` continues to render `<MarEmarTab .../>` as today.
- `MarEmarTab` component itself is left in place (still imported by admin).

## New file: `src/components/medications/staff-medications-panel.tsx`

Single presentational component. Props: `{ clientId, clientName, serviceContext? }`.

### 1. Client header card

- Small card, bold client name.
- Below in smaller muted text:
  - Allergies: read `clients.allergies` (existing column). If empty → "No known allergies".
  - Self-administration support status in plain words. Read from `clients` — reuse whatever `MarEmarTab` currently reads (e.g. `self_administration_status` / `self_admin_support_level` — will confirm exact column when writing). Render as human sentence, e.g. "Self-administers with support".
- No edit buttons, no admin actions.

### 2. "Due today" list

- Heading "Due today".
- Data source: `useShiftMedDueStatus` (already used by `shift-med-due-check`) with a windowStart = today 00:00 local, windowEnd = today 23:59 local. This is the same expansion of `client_medications.scheduled_times` that admin MAR uses, joined against `emar_logs`.
- Additionally load PRN meds (`is_prn = true`) from `client_medications` and append them as rows labeled "PRN" (no scheduled time).
- Each row:
  - Left: **medication name** (bold) + muted `dose · route · HH:MM AM/PM` (or "PRN").
  - Right: if `logged === false` → single `<Button>Log</Button>`; if logged → colored `<Badge>` with EMAR_STATUS_LABELS mapping (Observed / Refused / Missed / LOA / Omitted) followed by "· 8:04 PM" formatted from `emar_logs.administered_at ?? scheduled_for`. To get the recorded status+time, extend the query (or add a small sibling query) to return the matched log row for each scheduled dose.
- Empty state: "Nothing due right now."

### 3. "View full medication list" disclosure

- Small underlined muted button below the list. Toggles between "View full medication list" / "Hide full medication list".
- When open, plain list of every active `client_medications` row: name, dose, route, schedule (`scheduled_times` joined with ", " or "PRN" / frequency). Read-only. No action buttons.

### 4. Log dialog

New component `LogDoseDialog` inside the same file (or sibling). Opens from a row's "Log" button.

- Title: `Log {medication_name}`.
- 2×2 grid of toggle buttons: **Observed**, **Refused**, **Missed**, **LOA**. Single-select via local state. Selected button gets `variant="default"`, others `variant="outline"`.
- **Time observed**: `<Input type="time">` initialized to current time on open. Editable. Combined with today's date to form ISO for `actualTakenAt`.
- **Note**: `<Textarea>`. Required if status ≠ Observed.
- **Attestation sentence**: live-computed string, e.g.
  - Observed → "I attest that {med} was observed being self-administered at {time}, as recorded above."
  - Refused → "I attest that {med} was refused at {time}, as recorded above."
  - Missed → "I attest that {med} was missed at {time}, as recorded above."
  - LOA → "I attest that {med} was sent with the Person during an approved leave at {time}, as recorded above."
- **Type your full name to confirm**: `<Input>` starting empty on every open (reset via a `key` on the dialog or explicit reset in `onOpenChange`). NOT prefilled — even though we know the user's name server-side.
- Buttons: `Cancel` (discard + close), `Save`.

### 5. Save behavior — client-side validation then server call

Order of validation (each failure shows a `toast.error` and aborts):

1. Status selected.
2. Time value present.
3. If status ≠ Observed → note non-empty (trimmed).
4. Typed name non-empty (trimmed).

Then invoke existing server fn `logMedicationPass` from `@/lib/emar-pass.functions` via `useServerFn`, mapping:

| Field | Value |
|---|---|
| `clientId` | prop |
| `medicationId` | row.medication_id |
| `scheduledFor` | row.scheduled_for_iso (for PRN: use current ISO) |
| `scheduledTimeLabel` | row.time_label (null for PRN) |
| `status` | Observed→`self_administered`, Refused→`refused`, Missed→`missed`, LOA→`loa` |
| `administratorRole` | `staff_observed` for Observed; `self` for the exception statuses (matches existing exception flows and avoids the hands-on gate) |
| `route` | row.route ?? "PO" |
| `actualTakenAt` | ISO from time picker |
| `exceptionReason` | note (only for non-Observed) |
| `notes` | note if Observed and provided; else null |
| `signatureDataUrl` | small inline SVG data URL rendering typed name — satisfies server's `min(10)` signature requirement and preserves the typed-name evidence: `data:image/svg+xml;utf8,<svg …><text>{typedName}</text></svg>` (URL-encoded) |
| `serviceContext` | prop (e.g. "HHS", active shift's service code if available) |
| `isMedicationError` | false |

The server fn already:
- Writes a canonical `signature_attestation` string with staff full name and timestamp.
- Enforces PRN/rescue/controlled requirements (staff Log flow will see server errors surfaced via toast if a PRN/rescue/controlled med is logged without required extras — acceptable; those flows already require the full MAR UI and are out of scope for this simplification. If a Log click hits one, we surface the server error message).
- Writes to `emar_logs`, the same table the admin eMAR reads.

On success: `toast.success`, close dialog, invalidate the due-status query (`queryClient.invalidateQueries({ queryKey: ["shift-med-due-status", ...] })`) so the row flips to the logged badge.

## Data / query notes

- Extend or wrap `useShiftMedDueStatus` locally so each dose also carries the matched `emar_logs.status` + `administered_at` when `logged === true`. Simplest: add a second small `useQuery` in the panel that fetches `emar_logs` for the window and joins in JS by `medication_id + scheduled_for`.
- All queries use the browser `supabase` client + existing RLS. No schema changes, no migrations.

## Out of scope

- Admin MarEmarTab, EmarChart, EmarNectarPanel, EmarOpsPanel — unchanged.
- Refills, transfers, compliance audit tools, "Add Medication", "Upload MAR/Order" — removed from staff view entirely (by virtue of not being on the new panel).
- PRN reason capture / rescue seizure fields / controlled counts UI — not added to the staff Log dialog (server will reject with a clear message on the rare staff PRN/controlled tap; those meds are typically handled from the admin MAR).

## Files touched

- **Create:** `src/components/medications/staff-medications-panel.tsx`
- **Edit:** `src/routes/dashboard.workspace.$clientId.tsx` (swap import + JSX)
- **Edit:** `src/routes/dashboard.hhs-hub.$clientId.tsx` (swap import + JSX)
