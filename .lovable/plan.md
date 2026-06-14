# Guardian status + per-action attestations on incidents

Three layers: schema, conditional duty, attestation-gated actions. Existing incident drafting / Nectar review / clocks stay intact.

## Part 1 — Guardian fields on the client profile (migration)

Add to `public.clients`:

- `is_own_guardian boolean NOT NULL DEFAULT false`
- `guardian_name text`
- `guardian_phone text`
- `guardian_relationship text`
- `guardian_email text` (optional)
- `guardian_address text` (optional)

CHECK constraint (immutable, safe): when `is_own_guardian = false`, require `guardian_name` and `guardian_phone` non-empty. When `is_own_guardian = true`, all guardian_* fields must be null/empty (avoid stale data).

No new RLS — existing `clients` policies cover it.

UI: extend the existing client-edit form in `src/routes/dashboard.clients.tsx`. Add a "Guardianship" section near Emergency contact:
- Radio "Is the client their own guardian?" Yes / No.
- When No → guardian name, phone, relationship (required), email/address optional.
- Admin/manager only (already gated by existing edit policies).
- Select list and update payload extended to include the new columns.

## Part 2 — Conditional guardian duty

Wherever the 24-hour guardian clock is computed:

1. **`src/lib/incident-deadlines.ts`** — `getIncidentOpenClocks` takes an additional `clientIsOwnGuardian: boolean` flag (or accept full input including it). When true, do NOT emit the `guardian_notified` clock. Add a new clock kind `guardian_notified` (currently the file only has UPI clocks — guardian clock today is implemented inline in `admin-incidents-section.tsx`). Plan: keep the source of truth in `incident-deadlines.ts`; admin section uses the helper.

2. **`src/hooks/use-deadlines.tsx`** — when building incident clocks, also fetch `clients.is_own_guardian` (already loaded via the `clientsQ` — extend select) and pass it into the helper so guardian rows never appear for own-guardian clients.

3. **`src/components/incidents/admin-incidents-section.tsx`** — fetch `clients.is_own_guardian, guardian_name, guardian_phone, guardian_relationship` alongside incidents (single query keyed by `client_id`s). Suppress the `Guardian 24h` `CountdownPill` and the "Log guardian notification" button when own-guardian. Show a small `"Self-guardian — no notification required"` line in its place inside the action footer.

## Part 3 — Guardian contact info in the dialog

`GuardianDialog` (in `admin-incidents-section.tsx`) gets `clientId` plus the guardian fields and renders, at the top:

```
Notifying:  <guardian_name> (<relationship>)
Phone:      <guardian_phone>
```

Read-only block. Fetched via a small new server fn `getClientGuardianInfo({ id })` returning `{ is_own_guardian, guardian_name, guardian_phone, guardian_relationship, guardian_email }` (manager-only). If the dialog is opened for an own-guardian client (should be impossible from UI), it shows "Client is their own guardian — no notification required" and disables submission.

## Part 4 — Per-action attestations with signature

Schema migration — `incident_reports` add columns:

- `guardian_attestation_text text`, `guardian_signed_name text`, `guardian_signed_title text`, `guardian_signed_at timestamptz`
- `upi_initiated_attestation_text text`, `upi_initiated_signed_name text`, `upi_initiated_signed_title text` (signed_at = existing `upi_initiated_at`)
- `upi_completed_attestation_text text`, `upi_completed_signed_name text`, `upi_completed_signed_title text`
- `sc_update_attestation_text text`, `sc_update_signed_name text`, `sc_update_signed_title text`, `sc_update_signed_at timestamptz`, `sc_update_signed_by uuid` (the existing `incident_sc_requests` covers "requested a response"; this attestation is the act of informing/updating the SC — distinct.)

Attestation text constants live in a new `src/lib/incident-attestations.ts`:

```ts
export const GUARDIAN_ATTESTATION =
  "I attest that I notified the Person's guardian, {guardian_name}, of this incident on {when} via {method}, and that the information provided was accurate.";
export const UPI_INITIATED_ATTESTATION =
  "I attest that I initiated entry of this incident report into the UPI system on {when} and that the information submitted is true and accurate to the best of my knowledge.";
export const UPI_COMPLETED_ATTESTATION =
  "I attest that I completed and submitted this incident report in the UPI system on {when} and that the information submitted is true and accurate to the best of my knowledge.";
export const SC_UPDATE_ATTESTATION =
  "I attest that I provided this incident information to the Person's Support Coordinator on {when}.";
```

Server fns (`src/lib/incidents.functions.ts`) — extend each existing fn's input validator:

| Fn | New required input |
|---|---|
| `markGuardianNotified` | `attested: true (literal)`, `signed_name`, `signed_title`. Writes attestation_text (resolved template), signed_name/title, signed_at = `notified_at` |
| `markUpiInitiated` | same shape |
| `markUpiCompleted` | same shape |
| new `markScUpdated` | `id`, `attested`, `signed_name`, `signed_title`, optional `notes` |

Each fn rejects without `attested === true`, non-empty `signed_name`, `signed_title`. All gated by `requireManager`.

UI — wrap each action button in a shared `<AttestationDialog>` component (new `src/components/incidents/attestation-dialog.tsx`):

- Header: action label.
- Body: action-specific attestation paragraph (template resolved with current preview values).
- Required checkbox "I confirm the above attestation."
- Inputs: full name, title, auto-filled "Signed at: <now>".
- Submit calls the relevant server fn; button disabled until checked + both inputs filled.

Replace the current `markUpiInitiated` / `markUpiCompleted` direct buttons with this dialog. Same for the existing `GuardianDialog` (extended; currently only collects method) — add attestation block + signature inputs.

Add an `SC Update` button + dialog driven by `markScUpdated`. (Keeps the existing "Request SC response" flow untouched.)

Show, in the existing "history" footer below an incident, the signer + date for each attested action, e.g. `Guardian notified (phone) Jan 4 2026 · signed by Jane Doe, Program Director`.

## Verification

1. Edit a client → set "is own guardian = yes" → save. Open a fresh incident for that client → no `Guardian 24h` pill, no "Log guardian notification" button, Deadlines page shows no guardian item for them.
2. Edit a different client → "is own guardian = no" + name "Mary Sample" + phone. Open an incident → guardian pill shows, Deadlines page shows it. Click "Log guardian notification" → dialog shows Mary Sample + phone at top.
3. Try to submit any of the 4 actions without checking attestation / filling name+title → button disabled.
4. Submit each → row footer shows `… signed by <name>, <title>`. Re-open dialog disabled (already complete).
5. Existing incident drafting, Nectar review, UPI clocks still function (clocks unchanged in math, just sourced from the same helper).
