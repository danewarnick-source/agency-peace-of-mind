## Problem

There are two authorized-codes UIs. My earlier change updated `BillingCodesDetail` (used on `/dashboard/billing/$clientId`), but the client profile Billing tab (`/dashboard/clients/$clientId?tab=billing`) — where you're looking — still renders a legacy inline table in `src/routes/dashboard.clients.$clientId.tsx`:

- `BillingCodesPanel` (line 1263) → `EditableBillingCodesTable` (line 1387) → `EditableBillingCodeRow` (line 1420), which has a per-row **Edit** button and no Delete.

## Fix

In `src/routes/dashboard.clients.$clientId.tsx`:

1. Replace the `<EditableBillingCodesTable …>` call inside `BillingCodesPanel` with the updated `<BillingCodesDetail clientId={clientId} />` (single header **Edit** button, per-row **Delete** with confirm, bulk Save all / Cancel).
2. Keep the reclaim banner and the "Add a new authorized code" `AddCodesControl` block wrapping it.
3. Delete the now-unused `EditableBillingCodesTable`, `EditableBillingCodeRow`, and `BillingCodeTableRow` type, plus any imports that become unused (`Pencil`, `X`, `CheckCircle2`, `Table*`, `UNIT_TYPE_OPTIONS`, `unitTypeLetter`) — only remove ones with no remaining references in the file.
4. Add `import { BillingCodesDetail } from "@/components/clients/billing-codes-detail"`.

No schema or business-logic changes.