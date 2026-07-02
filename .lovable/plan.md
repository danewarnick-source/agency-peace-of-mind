# Build: HIVE-managed email (Mode 1 only)

Migration already applied: `org_email_settings.send_mode` (default
`hive_managed`), `from_address` now nullable, one hive_managed row seeded
for every org.

## Files to change

### 1. `src/lib/email.functions.ts` — full rewrite

- Add exported constant
  `HIVE_MANAGED_FROM_ADDRESS = "onboarding@resend.dev"` with a "SWAP-POINT"
  comment: change to `notifications@mail.hivehcbs.com` once that domain is
  verified in Resend. No other file will hardcode a From address.
- Add exported server-only helper
  `resolveOrgSender(supabase, orgId) → { from, reply_to, send_mode }`:
  - reads `org_email_settings` + `organizations.name`
  - `from = "${settings.from_name || org.name || 'HIVE Notifications'} <${HIVE_MANAGED_FROM_ADDRESS}>"`
  - `reply_to = settings.reply_to` (throws a UI-friendly error if missing)
  - `send_mode: "hive_managed"` always for now; `own_domain` falls through
    to hive_managed rather than blocking sends.
- `getOrgEmailSettings`: return `{ settings, hive_managed_from_address }`
  so the UI can preview what recipients will see without hardcoding.
- `updateOrgEmailSettings`: input becomes
  `{ organization_id, send_mode?, from_name?, reply_to }`; `reply_to`
  required + validated as email; `own_domain` mode explicitly rejected
  with "not available yet" message; upsert forces `send_mode='hive_managed'`,
  `from_address=null`, `verified=true`.
- `sendEmail`: drop old settings/verified check; call `resolveOrgSender`,
  then invoke `send-email` edge fn with `from = sender.from` and
  `reply_to = data.reply_to ?? sender.reply_to` (per-call override wins,
  org-level is always present).

### 2. `src/lib/employee-loans.functions.ts` — loan-signature email

Replace the inline `org_email_settings` lookup + verified-gate + from
composition (lines ~293–334) with:

```ts
import { resolveOrgSender } from "@/lib/email.functions";
...
let emailStatus = { ok: false, error: "..." };
try {
  const sender = await resolveOrgSender(supabase, data.organization_id);
  const html = `...` // unchanged
  const { data: invokeData, error: invokeErr } =
    await (supabase as any).functions.invoke("send-email", {
      body: {
        from: sender.from,
        to: data.signer_email,
        subject: `Loan agreement ready for your signature — ${loan.lender_name}`,
        html,
        reply_to: sender.reply_to,   // provider's inbox
      },
    });
  if (invokeErr) emailStatus = { ok: false, error: invokeErr.message };
  else if (!invokeData || invokeData.ok !== true)
    emailStatus = { ok: false, error: invokeData?.error || "Email send failed" };
  else emailStatus = { ok: true };
} catch (e) {
  emailStatus = { ok: false, error: e instanceof Error ? e.message : "Email send failed" };
}
```

Result: TNS loan-signature email actually sends. Reply-to = the address
the provider entered in Settings → Email. If reply-to isn't set yet, the
signing link still generates and shows a fixable error in the UI.

### 3. `src/lib/billing-notifications.server.ts` — replace `getSenderFor`

Currently gates on `verified && from_address`, both no-ops in Mode 1.
Replace with a supabaseAdmin-scoped version of the same helper:

```ts
async function getSenderFor(orgId: string): Promise<{ from: string; reply_to: string } | null> {
  try {
    return await resolveOrgSender(supabaseAdmin, orgId);
  } catch { return null; }   // Silent: billing state changes must never break on email
}
```

Then include `reply_to: sender.reply_to` in the `functions.invoke` body.

### 4. `src/routes/dashboard.settings.email.tsx` — Mode 1 UI

Rewrite to remove From-address, Verified toggle, and Resend-DNS copy.
New fields:

- **Reply-to address** (required, email) — "Recipients replying to HIVE
  emails will land here." Save-blocked until valid.
- **From display name** (optional, defaults to org name) — "Inbox shows
  `{name} <notifications@mail.hivehcbs.com>`." Preview uses the constant
  returned by `getOrgEmailSettings`.
- Banner: "HIVE-managed sending is on. Zero DNS setup required. Custom
  domain sending is coming."
- Existing "Send a test" panel stays; test emails now go through the
  HIVE-managed sender with the org's reply-to.

## Out of scope (deferred)

- Mode 2 own_domain flow, Resend Domains API integration, DNS records UI,
  verification polling. Server fn hooks reserve the mode but reject it.
- Migrating the current `onboarding@resend.dev` bootstrap to a verified
  HIVE subdomain — that's a one-line change to `HIVE_MANAGED_FROM_ADDRESS`
  the moment DNS is done.

## Verification (after build)

1. Open Settings → Email as TNS admin, enter reply-to, save.
2. Send loan for signature → email arrives at signer with From =
   `True North Supports <onboarding@resend.dev>`, reply-to = TNS address.
3. Recipient hits Reply in Gmail → address auto-fills with TNS reply-to,
   not the Resend domain.
4. "Send a test" from Settings → Email works with the same envelope.
