# Structured PCSP goals + service-code filtering

## What exists today

- `client_specific_trainings.goals` (jsonb) already stores structured `CSTGoal` = `{ id, goal, supports, details, job_codes[] }`. NECTAR's PCSP extractor (`extractGoalsVerbatim` in `src/lib/client-specific-training.functions.ts`) already emits this shape.
- The legacy `clients.pcsp_goals` (`text[]`) still holds a flat, code-less mirror of the goal *statements*. It's what the client detail PCSP tab, the staff shift clock-out screen (`punch-pad.tsx`), whiteboard scoring, and daily-log tagging all read.
- The GoalsEditor in `client-specific-training-card.tsx` exposes `job_codes` as a free-text comma-separated field. There is no per-goal service-code editor on the PCSP tab itself.

## What changes

### 1. Structured goals become the canonical read source

Replace flat-string reads of `clients.pcsp_goals` on the two surfaces that matter for this feature:

- **Client detail → PCSP tab (`src/components/clients/pcsp-tab.tsx`)**: source goals from `client_specific_trainings.goals` (person_specific). Render each goal with: statement, Supports, Objective/measure, and a service-code chip row.
- **Staff clock-out (`src/components/evv/punch-pad.tsx`)**: fetch structured goals for the locked client and filter to those whose `job_codes` include the shift's active `service_code`. Goals with an empty `job_codes` array are hidden from staff (this is the "flagged, needs admin" state). The goals-worked writeback keeps using the goal statement text as the key so downstream logs are unaffected.

`clients.pcsp_goals` stays populated as a mirror of the goal statements (existing save paths already do this) so whiteboard scoring, daily-log tagging, and audit packaging don't break.

### 2. Editable service codes on the PCSP tab

Directly on `pcsp-tab.tsx`, each goal row gets a chip picker for service codes:

- Chips render current `job_codes`; each has an × to remove.
- An "Add code" chip opens a small menu listing the client's currently authorized codes (from `client_billing_codes`, active window). Picking one appends it.
- Save writes the updated `goals` array back to `client_specific_trainings` for that client + `training_type = 'person_specific'`, and re-mirrors goal statements into `clients.pcsp_goals`.
- Admin-only (gated behind existing "edit client" permission the tab already uses).

The full goal editor (statement / supports / objective wording) stays reachable via the existing "Edit goals" path — this prompt only adds inline service-code editing at the tab level, since that's the ask.

### 3. Extraction stays as-is, wording surfaced

NECTAR already extracts `goal`, `supports`, `details`, `job_codes`. UI labels in GoalsEditor and pcsp-tab are relabelled so the four fields read as: **Goal**, **Supports (what staff do)**, **Objective / measure**, **Service codes** — matching the ask. No prompt or schema change to the extractor.

### 4. Retroactive backfill (one-time migration)

For every client where `clients.pcsp_goals` is non-empty AND there is no `client_specific_trainings` row of type `person_specific` with a non-empty `goals` array, insert/update a CST row whose `goals` is:

```
pcsp_goals.map(text => ({ id: gen_random_uuid(), goal: text, supports: '', details: '', job_codes: [] }))
```

Consequence: these clients keep their goal *text*, get `supports`/`details`/`job_codes` empty (visibly flagged as incomplete on the PCSP tab), and — because `job_codes` is empty — none of these goals appear for any staff member during a shift until an admin assigns at least one code. This matches the requested behavior exactly.

## Files touched

- `supabase/migrations/<new>.sql` — one-time backfill from `clients.pcsp_goals` into `client_specific_trainings.goals`. No schema changes; the target column already exists.
- `src/components/clients/pcsp-tab.tsx` — read structured goals; render Supports / Objective / service-code chip picker; save on edit.
- `src/components/clients/client-specific-training-card.tsx` — relabel fields; keep GoalsEditor working (used by extract dialog).
- `src/components/evv/punch-pad.tsx` — fetch structured goals for the locked client, filter by shift `service_code`, drop the flat `clients.pcsp_goals` path for the goals checklist.
- `src/routes/dashboard.workspace.$clientId.tsx` — pass structured goals (or let punch-pad fetch) instead of the flat string list.

Not touched: whiteboard scoring, daily-log tagging, audit package assembly, NECTAR extraction prompt, `clients.pcsp_goals` schema.

## Out of scope

- No new DB table for goals. The existing jsonb column already models everything the ask needs, and splitting it out would ripple through a dozen surfaces for no user-visible gain.
- No change to how the extractor decides which code to attach — it stays best-effort; admins fix it on the tab, which is the whole point of making the codes editable there.
