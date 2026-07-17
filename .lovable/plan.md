## Problem

On the incident report's NECTAR follow-up step, questions like *"Was Justin's guardian or authorized representative notified of the injury and urgent care visit?"* are marked "Must answer" and block continuing. Today the only way to satisfy them without typing an answer is to check "Not applicable" and type a reason into a text box. For clients who are their own guardian (or clients with no guardian at all), staff shouldn't have to explain that in prose — it's a fact the system already knows or can capture in one tap.

## Fix

Add a one-click **N/A** button to every NECTAR follow-up question in the incident report form, and make it smart for guardian-notification questions specifically.

### 1. Load the client's guardian status when the dialog opens

When the report dialog mounts with a `clientId`, fetch that client's `is_own_guardian` flag (and `guardian_name` for the label) from `clients` via the existing supabase client. Cache it in local state. No new server function needed — this is a single read the staff already have RLS access to.

### 2. One-click N/A button on each follow-up

In `renderQuestionStep` (src/components/incidents/incident-report-dialog.tsx, ~line 951), add a button row above the existing "Not applicable — reason" checkbox:

- **Default label:** `Mark N/A`
- Clicking it toggles the N/A state on with a default reason of `"Not applicable"` (already enough to satisfy the "answered" gate — the existing `answered` check in the `submitBlocked` logic accepts any non-empty `aiNA[idx]`, and empty string counts as answered too since the check is `aiNA[idx] !== undefined`, but we set a short default so the audit trail isn't blank).
- Clicking it again clears N/A.
- The existing checkbox + free-text reason field stays as-is for staff who want to type a custom reason.

### 3. Smart label for guardian-notification questions

Detect guardian questions by matching the question text (case-insensitive) against `/guardian|authorized rep(resentative)?/`. When it matches AND the client's `is_own_guardian === true`:

- Change the button label to: **`Not applicable — {ClientFirstName} is their own guardian`**
- The auto-filled reason becomes: `"Client is their own guardian — no separate notification required."` (mirrors the phrasing already used in the admin GuardianNotifyDialog at admin-incidents-section.tsx:218 so the audit trail is consistent across the app.)
- Show a small helper line under the question: *"This client is their own guardian — no guardian notification is required."*

When it matches but `is_own_guardian` is false/unknown, keep the plain `Mark N/A` label (staff may still legitimately need to explain, e.g., guardian unreachable).

### 4. No changes to submit gating or server payload shape

The existing `submitBlocked` logic already treats a non-undefined `aiNA[idx]` as "answered", and the payload already serializes N/A reasons into `nectar_followups`. Nothing else changes — no migration, no server function edits, no admin-side changes.

## Files touched

- `src/components/incidents/incident-report-dialog.tsx` — add the client guardian-status fetch, the N/A button, and the smart label logic inside `renderQuestionStep`.

## Out of scope

- The narrative-step follow-ups use the same `renderQuestionStep`, so they get the same button automatically — that's intentional and desirable.
- No change to the admin-side guardian notification workflow.
- No change to the existing "Not applicable — reason" typed field; it remains for staff who want to add context.
