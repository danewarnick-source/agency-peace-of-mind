## Problem
`ApprovalDialog` shows Approve/Deny (and the sign-to-resolve panel) whenever the server reports `viewer_side === "hive_admin"`. A HIVE Executive who also holds a provider admin membership currently sees those buttons when opening a ticket from the provider **Inbox** or from the Smart Import billing row — not just from the HIVE Executive queue. Resolution actions must be exclusive to the HIVE Executive route.

## Fix
Gate the resolve UI on the call site, not just the viewer role.

1. **`src/components/billing/ApprovalDialog.tsx`**
   - Add optional prop `allowResolution?: boolean` (default `false`) to `ApprovalDialogProps`.
   - Replace the `isHiveViewer` checks that render Approve/Deny buttons and the signature/attestation panel with `isHiveViewer && allowResolution`.
   - Keep the provider composer and read-only thread rendering unchanged; when `allowResolution` is false a HIVE viewer sees the thread + a plain reply composer (same UX as any admin-side viewer), with no Approve/Deny.
   - Adjust the composer helper text so it only says "click Approve / Deny to sign and resolve" when resolution is allowed.

2. **`src/routes/dashboard.hive-exec.billing-approvals.tsx`**
   - Pass `allowResolution` to the single `ApprovalDialog` render.

3. **Leave provider-side call sites unchanged** (`src/routes/dashboard.inbox.tsx`, `src/routes/dashboard.smart-import.$jobId.review.tsx`) — they simply don't pass the flag, so Approve/Deny never appears there for anyone, including HIVE Executives with dual roles.

No server, schema, or permission changes; server-side signature enforcement in `postApprovalMessage` remains the authoritative gate.
