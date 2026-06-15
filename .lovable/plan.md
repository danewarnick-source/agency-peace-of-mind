## Goal
Update the "Service codes" line in the right-column summary card on the client profile workspace so it displays the client's real billing authorizations (`client_billing_codes.service_code`) instead of the old saved list (`clients.job_code`).

## Where
`src/routes/dashboard.clients.tsx` — the `ClientWorkspace` → `ProfileTab` component chain.

## Changes
1. **Prop drilling**: Pass the already-fetched `billingCodes` array from `ClientWorkspace` into `ProfileTab`.
2. **Render swap**: In `ProfileTab`'s right-column "Client record info" card, replace the `client.job_code` source with `billingCodes` for the "Service codes" row only. No other UI or logic changes.

## Why this is safe
- `ClientWorkspace` already queries `useClientBillingCodes(client.id)` and maps it to `billingCodes`.
- The Billing tab (`CareBillingCodesEditor` / `BillingCodesDetail`) uses the same source, so the summary card will now always match the Billing tab.
- `client.job_code` is still used for edit forms and the directory table; nothing else on this page changes.

## Verify
- Open any client in the Client Directory workspace.
- The right-column "Client record info" card should show the same codes as the Billing tab, including day-program codes (DSG, DSP, DSI) when present.
- If a client has no billing authorizations, the line shows "None".