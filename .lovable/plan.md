## What actually happened to Blake's billing codes

I looked at the live data for Blake Adams. The PCSP extracted **DSI** and **HHS** correctly — but instead of landing on his profile as authorized codes, they were filed as "someone else's services":

```
client_billing_codes:      0 rows for Blake
client_external_services:  DSI, HHS — note: "Provider 'TRUE NORTH SUPPORTS LLC' is a different organization."
clients.authorized_dspd_codes: {}  (empty — matches the "None." you saw)
```

The classifier saw provider name **"TRUE NORTH SUPPORTS LLC"** on the PCSP, compared it to this tenant's display name (**"TNS FAKE"**), decided they didn't match, and — because the org has no aliases and no `codes_held` configured — silently routed both codes to the external/coordination bucket. There was no unconfirmed code holding things back; the pipeline confidently sent them the wrong way.

This is the same failure mode any provider will hit when the PCSP spells their legal name differently than their app display name (very common: "True North Supports LLC" on the state form vs. "TNS" or a nickname in-app).

## Fix — three parts

### 1. Recover Blake now (data-only)
- Move his two external rows into `client_billing_codes` as pending stubs (rate 0, `authorization_pending = true`) so Care-tab actions unblock and staff can be scheduled while units/rate get filled in.
- Set `clients.authorized_dspd_codes` and `job_code` to `{DSI, HHS}`.
- Delete the two `client_external_services` rows so the mis-file doesn't linger.

### 2. Stop the silent misclassification in Smart Import
- **Classifier change** (`src/lib/service-classification.ts`): when `provider_name` is present but the tenant has no `aliases` AND no `codes_held` configured, return `confident: false` instead of confidently marking the row as "other provider." That forces the review UI to show the "Owner?" prompt (which already has an **"Ours"** button) instead of quietly routing the code to external services.
- **Review UI** (`dashboard.smart-import.$jobId.review.tsx` billing panel): when every extracted billing row is being sent to `external_services`, show a prominent yellow banner: *"All N codes on this PCSP are being filed as another provider's. Confirm ownership or add 'TRUE NORTH SUPPORTS LLC' as an alias for TNS FAKE."* with a one-click **"Add as alias for this org"** button that appends to `organizations.aliases`. From that point forward all future imports match automatically.
- **Finalize gate** (`smart-import-review.functions.ts` → `setSubjectReady`): treat `code.confirm_owner.*` issues as blocking (they already are), and *also* refuse to mark ready when 100% of billing rows are going to external services without an explicit `code.coordination.*` override — same reasoning: don't let a provider "finalize" a client with zero of their own billing codes attached unless they meant to.

### 3. On-profile safety net for clients already finalized
On the client profile's **Authorized DSPD codes** card:
- When `client_external_services` has rows whose `provider_name` matches this org (by fuzzy match against name/legal_name/aliases) OR when the client has PCSP goals scoped to codes that aren't in `authorized_dspd_codes`, show an amber row: *"2 codes from PCSP aren't authorized: DSI, HHS — [Reclaim as ours]"*. Clicking reclaims them (same data patch as step 1).
- Wire the existing manual "Add code" input to also insert a matching `client_billing_codes` stub (`authorization_pending = true`) instead of only mutating the array — otherwise scheduling still can't use it.

### Technical notes
- Recovery in step 1 is a one-shot SQL migration scoped to Blake's client id.
- Alias write in step 2 uses `array_append(organizations.aliases, ?)` and requires `manage_users`.
- The reclaim action in step 3 is a small server fn `reclaimExternalCodesAsOurs({ clientId, codes[] })` that mirrors the commit-time pipeline: insert stubs, update `authorized_dspd_codes`/`job_code`, delete the external rows.
- No changes to the extractor, PCSP goals, or the finalize wizard's other steps.

### Out of scope (say so if you want them in)
- Auto-learning aliases from every PCSP the classifier sees.
- Bulk retroactive rescue across all finalized clients (I'll do Blake only; if you want, I can add an admin tool that scans every client and offers the same "reclaim" fix in bulk).
