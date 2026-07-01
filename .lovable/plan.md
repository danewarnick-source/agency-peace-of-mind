## Product change

Replace the provider-side "I have HIVE approval" self-attest toggle on external billing-code rows with a **real approval request** that lives as a threaded conversation between the provider and HIVE Admin. No more provider self-attestation.

Flow:
1. Provider hits **Request HIVE Admin approval** on an external billing-code row → dialog requires a **justification** (why they should be allowed to bill this outside-provider code; why the PCSP Provider name doesn't match theirs).
2. Request opens a **threaded conversation** between the provider org's admin(s) and HIVE Admin (super_admin role). Both sides can post messages, any time, no time limit — persistent thread.
3. Thread appears in the provider's existing **Inbox** and in a **HIVE Admin Approvals** queue on the super-admin console.
4. Every HIVE-admin message includes inline **Approve** and **Deny** buttons — one click resolves the request; both sides see the outcome in-thread.
5. Once **approved**, the billing-code row on that import gets a real, server-persisted `approval_status = 'approved'` badge with the approving super_admin, approval date, and thread link. Approved codes flow into 520s. Denied or pending → still excluded from billing.

## Data model — one migration

Two new tables + one column on the billing-code row extracted field. All RLS-scoped; both sides get GRANTs.

```
billing_code_approval_requests
  id, organization_id, requesting_user_id
  import_job_id, subject_id, extracted_field_id  -- ties to the exact row
  code, provider_name_on_pcsp
  justification (text, required at open time)
  status: 'pending' | 'approved' | 'denied' | 'withdrawn'
  resolved_by_user_id, resolved_at, resolution_note
  created_at, updated_at

billing_code_approval_messages
  id, request_id, sender_user_id
  sender_role: 'provider' | 'hive_admin'
  body (text)
  action: null | 'approve' | 'deny'   -- when set, the message IS the resolution
  created_at
  read_by_provider_at, read_by_hive_at
```

RLS:
- Provider org members with role admin/manager/super_admin can read/insert on requests+messages where `organization_id` matches their membership.
- HIVE Admins (`super_admin` role in the HIVE tenant, checked via existing helper) can read/insert on all rows and set `status` via approve/deny.
- `extracted_fields` gets no new column — the request references it by id, and the review UI joins the two.

## Server functions — `src/lib/billing-approvals.functions.ts` (new)

- `openApprovalRequest({ organizationId, importJobId, subjectId, extractedFieldId, code, providerNameOnPcsp, justification })` → creates request + seeds the opening provider message.
- `postApprovalMessage({ requestId, body })` → provider or HIVE admin posts a chat message. Marks the other side's unread.
- `resolveApprovalRequest({ requestId, action, note })` → HIVE-admin only; sets `status` and inserts a resolution message.
- `withdrawApprovalRequest({ requestId })` → provider only, while pending.
- `listMyApprovalRequests({ organizationId })` → provider view.
- `listPendingHiveApprovals()` → super-admin queue.
- `getApprovalThread({ requestId })` → request + ordered messages; enforces read side.
- `markApprovalThreadRead({ requestId })` → sets `read_by_*_at` for the caller's side.

Approvals also count toward the existing **Inbox unread badge**: `getInboxUnreadCount` gets a second query that adds unread messages on requests where the provider is a participant.

## UI changes

### Smart Import review — `src/routes/dashboard.smart-import.$jobId.review.tsx`
Replace the "I have HIVE approval / revoke" self-attest link (lines ~1877–1897) with a live approval widget per external row:

- No request yet → **Request HIVE Admin approval** button.
- Pending → amber "Request pending · view thread" link that opens the request drawer; provider can Withdraw.
- Approved → green "HIVE-approved — Approved by {name} on {date}" chip that opens the thread (read-only aside from new messages).
- Denied → red "Denied — reason" chip; still excluded from billing; provider can open a new request with fresh justification.

Remove the ephemeral `approvedExternal` local state and the local `toggleApproved`.

Drop the "I have HIVE approval" language from the header/summary block; rewrite to: *"External codes are excluded from billing unless HIVE Admin approves the exception. Use **Request approval** to send justification to HIVE Admin."*

### Request dialog — `src/components/billing/RequestHiveApprovalDialog.tsx` (new)
Shows the code, the PCSP-listed Provider name vs. provider org name, and a required justification textarea (min 30 chars) with prompt: *"Explain why {orgName} should be allowed to bill this code even though the PCSP lists {providerNameOnPcsp}. Include any authorization letters, plan-of-care references, or coordinator confirmations that HIVE Admin needs."*

### Thread drawer — `src/components/billing/ApprovalThreadDrawer.tsx` (new)
Shared component used by both sides.
- Header: code, provider name mismatch, status badge, subject/client link.
- Body: chronological messages (sender name + role + timestamp).
- Composer: textarea + Send.
- **HIVE Admin only** (role gate): Send has a split action — `Send`, `Send + Approve`, `Send + Deny`. `Send + Approve` requires the composer be non-empty (the approval reason lives in the message). Resolution renders as a distinct chip in the thread.
- Provider only, while pending: `Withdraw request` button in the header.
- Marks thread read on open.

### Provider Inbox — `src/routes/dashboard.inbox.tsx`
Add a second section: **HIVE Admin approval requests**, listing this org's requests (pending first, then resolved). Row click opens the same `ApprovalThreadDrawer`. Unread counts feed the sidebar Inbox pill (already wired).

### HIVE Admin queue — `src/routes/dashboard.super-admin.tsx`
New tab **Approval requests** with a table:
- Columns: Organization, Code, PCSP-listed Provider, Requesting user, Opened, Last activity, Status.
- Filters: Pending | Resolved | All.
- Row click → `ApprovalThreadDrawer` with approve/deny controls.

### Sidebar unread badge
No visual change — existing Inbox unread pill counts these too via the extended `getInboxUnreadCount`.

## Scope guardrails

- No changes to how billing codes commit, other than reading the `approval_status` off the linked request when the review committer resolves external rows — approved codes commit as billable, all others commit as `external_reference_only` (already the current outcome for external rows).
- No changes to `exec_messages` — that stays the one-way HIVE-to-provider broadcast surface. Approvals are their own threaded model.
- The old `approvedExternal` ephemeral toggle is fully removed — no back-door self-attest.
- No email/SMS delivery in this pass; unread lives in-app only. (Can be added later without schema changes.)
