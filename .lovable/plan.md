# Stage 1 — Add New Client Fork + `intake_status`

Adds a path-choice step to the existing Add New Client flow and persists an org-scoped `intake_status` on `clients`. No intake forms, attestations, reminders, or Needs-attention work — those are later stages.

## 1. Database

Migration adds one column to `public.clients`:

- `intake_status text NOT NULL DEFAULT 'pending'`
- CHECK constraint values: `pending | in_progress | awaiting_admin_signoff | complete`

No new policies — `clients` RLS already gates by org membership, which is the desired admin/manager gating for this field. No grants change.

## 2. Add New Client UI (`src/routes/dashboard.clients.tsx`)

Modify the existing `AddClientDialog` + parent `addMutation`:

- **Step 1 — Choice screen** shown first when the dialog opens. Two large buttons:
  - "Create profile & begin intake now"
  - "Create profile only (not ready for intake)"
  - Small back-link returns to choice from step 2.
- **Step 2 — Existing form** (unchanged fields, validation, layout). The dialog's submit button label adapts:
  - intake-now path → "Create & start intake"
  - profile-only path → "Create profile"
- One internal local state `mode: 'intake' | 'profile-only' | null` drives both the visible step and the submit behavior. No second/divergent form — the same `AddClientDialog` body renders for both paths.

Submit handler passes `mode` to `addMutation`, which writes `intake_status`:
- `'profile-only'` → `intake_status: 'pending'`
- `'intake'` → `intake_status: 'in_progress'`

On success:
- profile-only → close dialog, stay on directory (current behavior).
- intake → close dialog, `navigate({ to: '/dashboard/clients/$clientId/intake', params: { clientId: newId } })` (the insert is changed to `.select('id').single()` so we have the new id).

Reading: the existing `useQuery` select list adds `intake_status` so later stages can read it; no UI badge is added this stage.

## 3. Placeholder intake route

New file `src/routes/dashboard.clients.$clientId.intake.tsx`:
- Minimal route, reads `clientId` param, renders a centered card titled "Intake procedure — coming in next build" with the client's name (small `useQuery` for first/last name) and a "Back to Clients" link.
- No forms, no writes.

## 4. Out of scope (explicitly NOT touched)

- Forms, attestations, auto-population, PDF storage.
- Reminder bubbles, Needs-attention integration, directory badges.
- Staff portal, EVV, billing, RLS beyond the new column.
- The edit-client mutation (does not touch `intake_status`).

## 5. Verification

- Open Clients → Directory → Add New Client → choice screen appears.
- "Create profile only" → form → save → row exists with `intake_status='pending'`, directory shows it, dialog closes.
- "Begin intake now" → same form → save → row exists with `intake_status='in_progress'`, browser navigates to `/dashboard/clients/{id}/intake` placeholder.
- Both paths use identical fields/validation; existing save path still works.
- `select intake_status from clients` returns the values for later stages; staff portal routes unchanged.
