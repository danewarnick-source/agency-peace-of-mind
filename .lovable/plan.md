# HIVE Executive-only billing approval tickets, with signature-to-resolve

## Clarifying what changes (and what doesn't)

**Doesn't change.** HIVE Executive already has its own surface at
`/dashboard/hive-exec/billing-approvals` (in the exec sidebar as "Billing Approvals").
That page — not the provider inbox — is where HIVE Admin lives. HIVE Admin
never sees anything inside a provider org's inbox: the
`BillingApprovalsInboxSection` in `src/routes/dashboard.inbox.tsx` uses
`listMyApprovalRequests`, which is scoped to the caller's own org, so it only
shows the *provider's* side of the thread to that provider. That's correct and
stays.

**Does change.** Two gaps to close:

1. The exec page reads like a list, not a **ticket inbox**. Rebrand + treat each
   pending request as a ticket ("New billing approval request — DSI — TNS")
   with an unread badge, "Open ticket" affordance, and a clear "Resolved" state
   after action.
2. Approve / Deny currently resolves on a single click with no signature. Add a
   required **signature step**: typed full name + attestation checkbox +
   timestamp, captured on the resolving click. Signature is stored and shown in
   the thread history so the resolution is defensible.

## Scope

### 1. Database (one migration)

Add signature capture columns to `billing_code_approval_requests`:

- `resolved_signature_name TEXT` — typed full name of the HIVE Admin.
- `resolved_signature_attested BOOLEAN` — attestation checkbox state.
- `resolved_signature_at TIMESTAMPTZ` — when the signature was captured.

Also add the same columns to `billing_code_approval_messages` for the
resolving message row (so the audit line in the thread carries the signature).

No RLS changes — existing policies already scope by role/org.

### 2. Server function (`src/lib/billing-approvals.functions.ts`)

- Extend `PostApprovalMessage` input with optional `signatureName`,
  `signatureAttested`.
- In the handler, when `action` is `approve` or `deny`:
  - Require both `signatureName` (non-empty) and `signatureAttested === true`;
    reject with a clear error otherwise (`"Signature required to resolve."`).
  - Write `resolved_signature_name`, `resolved_signature_attested`,
    `resolved_signature_at = now()` on the request row (alongside the existing
    `resolved_by_user_id` / `resolved_at`).
  - Copy the same three signature fields onto the newly inserted message row.
- Include the new fields in `ApprovalRequestRow` and message payloads returned
  by `listPendingHiveApprovals` and `getApprovalThread`.

### 3. Signature UX in `ApprovalDialog` (`src/components/billing/ApprovalDialog.tsx`)

Only when the current side is `hive_admin` and status is still `pending`:

- Replace the current one-click Approve / Deny buttons with a "Sign to
  resolve" mini-panel that appears when the admin clicks Approve or Deny:
  - Radio (already-picked action, disabled) or two clearly-labeled buttons that
    open the panel with the chosen action pre-selected.
  - Input: "Type your full name to sign" (must match the signed-in exec
    profile name — case-insensitive trim compare; mismatch shows an inline
    error).
  - Checkbox: "I attest this decision is final and recorded in the audit
    trail." (label copy is legal-safe, no medical claims.)
  - Confirm button: `Sign & approve` / `Sign & deny` — disabled until name +
    attestation are filled.
  - Cancel button: returns to reply mode without resolving.
- On confirm, mutation posts `{ action, signatureName, signatureAttested }`.
  On success, dialog reflects the resolved state and shows the signature line
  ("Signed by Jane Doe · Jul 1, 2026 4:57 PM").
- In the message history render, resolution messages carry a small
  "Signed by … at …" line under the message body.

### 4. Reframe the exec queue as a ticket inbox (`src/routes/dashboard.hive-exec.billing-approvals.tsx`)

Contained polish only — no route change, no rename in the sidebar:

- Header copy: "Billing Approval Tickets — incoming from providers."
- Each row shows a ticket-style label: `#<short id> · <code> · <org>` with a
  status pill (New / Awaiting your reply / Resolved) driven by
  `status` and `unread_for_me`.
- Primary action button says "Open ticket" (already does).
- After a ticket is resolved, the row automatically moves to the Resolved tab
  on next refetch (the page already refetches every 30s and after dialog
  close — keep as-is).

### 5. Out of scope

- No changes to how providers submit requests (SubjectReview billing editor
  stays as-is).
- No changes to the provider inbox surface — it correctly shows only the
  provider's own conversations.
- No new notification channel (email/SMS). The existing unread badge on the
  exec nav item (if wired) is enough; adding email is a separate ask.

## Acceptance

- HIVE Admin only ever sees billing approval conversations under
  `/dashboard/hive-exec/billing-approvals`; the provider inbox remains
  provider-only.
- Clicking Approve or Deny requires typing the signer's name and checking the
  attestation before the ticket resolves.
- Resolved tickets display the signer's name and signature timestamp both on
  the request summary and on the resolving message in the thread.
- Attempting to resolve without a signature returns a clear error and does not
  mutate the request.
