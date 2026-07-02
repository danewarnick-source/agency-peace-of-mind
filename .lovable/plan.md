# Auto-Renew Expiring Trainings

Give admins a "set it and forget it" toggle so HIVE automatically re-purchases and re-assigns training seats before staff certificates expire. Stays inside the PHI-free `hive_training_*` boundary.

## UX

**Where it lives:** top of the Renewals section on `/dashboard/hive-training` (admin view), as a single card above the checkbox list.

- Toggle: **"Auto-renew expiring trainings"** (org-level, default off)
- When on, reveal three compact controls:
  - **Renew how early?** 30 / 45 / 60 / 90 days before expiration (default 45)
  - **Scope:** All courses · Full Program only · Selected courses (multiselect from catalog)
  - **Payment method:** dropdown of the org's saved Stripe payment methods (Stripe customer portal link if none saved)
- Small muted footnote: "We'll email you a receipt each time. You can pause anytime."
- Status line under the toggle when active: "Next auto-renewal check: {date} — {N} staff eligible"

Rows in the checkbox list below get a small "Auto" pill when covered by the active auto-renew rule, so admins see what's already handled vs. what still needs a one-off "Set up renewals."

## Data

New table `hive_training_auto_renew_settings` (PHI-free, no FKs into client tables):
- `organization_id` (pk), `enabled`, `lead_days`, `scope` enum (`all` | `full_program` | `selected`), `selected_catalog_ids uuid[]`, `stripe_payment_method_id`, `stripe_customer_id`, `last_run_at`, `paused_reason`, timestamps
- RLS: `is_org_admin_or_manager` read/write + service_role

New table `hive_training_auto_renew_runs` for audit trail:
- `organization_id`, `run_at`, `staff_count`, `seats_purchased`, `total_amount_cents`, `stripe_payment_intent_id`, `status` (`succeeded` | `card_failed` | `no_eligible` | `partial`), `error_message`
- Admin-read + service_role

## Backend

- **Edge fn `auto-renew-trainings`** (scheduled daily via pg_cron → pg_net):
  1. For each org with `enabled = true`, find `hive_training_assignments` where `expires_at BETWEEN now() AND now() + lead_days` and no active future assignment exists.
  2. Filter by `scope` (bundle into Full Program when it's cheaper than à-la-carte, same logic as manual flow).
  3. Charge saved payment method off-session via Stripe PaymentIntent (`off_session: true`, `confirm: true`).
  4. On success: insert seats, create `hive_training_assignments`, insert `hive_training_renewal_intents` rows already marked consumed, email receipt.
  5. On card decline / `authentication_required`: set `paused_reason`, email admin with "update payment method" link, log run as `card_failed`.
- **Reuses existing** `create-training-checkout` catalog-resolution helpers; no new pricing logic.
- **pg_cron:** daily 08:00 UTC calling `/api/public/hooks/auto-renew-trainings` (auth via `apikey` anon key per project pattern).

## Out of scope
- Staff view changes
- Reminder emails beyond the auto-renew receipt / failure notice
- Auto-renew for anything outside `hive_training_*` (no PHI, no cert types in the main compliance module)
- Retry logic beyond the one-shot daily attempt (failure pauses the rule until admin acts)

## Build order
1. Migration (settings + runs tables, RLS, grants)
2. Edge fn + pg_cron schedule
3. Admin UI card + wiring
4. Stripe payment-method save flow (uses existing customer if present, else SetupIntent on first enable)
