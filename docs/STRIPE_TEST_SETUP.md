# Stripe test-mode setup (Dane)

Hive charges companies in **Stripe test / sandbox only**. No real cards are charged. Do not switch this to live keys.

## Linked account

| | |
|---|---|
| Name | Hive sandbox / Hive |
| Account id | `acct_1Ti6CMIQWmyptLnb` |
| Dashboard | [Test dashboard](https://dashboard.stripe.com/acct_1Ti6CMIQWmyptLnb/test/dashboard) |

Test mode must stay ON (switch in the top right of the Stripe Dashboard).

## Products (reuse if they already exist)

A separate pass is creating these in this sandbox. Copy each **Price ID** (`price_…`) when it exists. Until then Hive uses env placeholders — do not put fake IDs in git.

| Product | Amount | Billing | Env var |
|---|---|---|---|
| Hive Pro | $499 | Recurring, monthly | `STRIPE_PRICE_PRO` |
| Hive Enterprise | $1,299 | Recurring, monthly | `STRIPE_PRICE_ENTERPRISE` |
| Hive Training extra course | $49 | One time | `STRIPE_PRICE_TRAINING` |

- **Pro / Enterprise** are the public signup plans. Starter $0 is not self-serve.
- **Hive Training extra course** is for à-la-carte catalog courses (CPR and similar) that are **not** included in the plan. Pro and Enterprise already include HIVE Training, so the full program is not charged. True North (billing-exempt) is never charged for training.

## Environment variables (Vercel / Lovable)

Never paste these into GitHub. Test keys only (`sk_test_` / `pk_test_`).

- `STRIPE_SECRET_KEY` — `sk_test_…` (Developers → API keys)
- `STRIPE_PUBLISHABLE_KEY` — `pk_test_…`
- `STRIPE_WEBHOOK_SECRET` — `whsec_…` (from the webhook below)
- `STRIPE_PRICE_PRO` — Price ID for Hive Pro (placeholder until you paste it)
- `STRIPE_PRICE_ENTERPRISE` — Price ID for Hive Enterprise (placeholder until you paste it)
- `STRIPE_PRICE_TRAINING` — Price ID for Hive Training extra course $49 (placeholder until you paste it)

If keys are missing, True North can still log in. New agencies see a clear “payments are not set up” message instead of a crash.

## Webhook

In Stripe: **Developers → Webhooks → Add endpoint**

- URL: `https://agency-peace-of-mind.vercel.app/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Also turn on **Customer portal** (Settings → Billing → Customer portal) so “Manage billing” works.

## Test card

On any paywall that says **TEST MODE**:

- Card: `4242 4242 4242 4242`
- Expiry: any future date
- CVC: any 3 digits
- ZIP: any ZIP

## True North is never charged

True North Supports LLC is marked **billing-exempt**. Hive Exec can check that same box on another company to comp them later — no code change.

## SQL you must run

Paste the **Stripe billing: never charge True North** block at the top of `docs/SQL_HANDOFF.md` into Lovable’s SQL editor (clear the editor first). Until that runs, the exempt checkbox has no database column.
