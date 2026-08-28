# Stripe test-mode setup (Dane)

Hive charges companies in **Stripe test / sandbox only**. No real cards are charged. Do not switch this to live keys.

## Linked account

| | |
|---|---|
| Name | Hive sandbox / Hive |
| Account id | `acct_1Ti6CMIQWmyptLnb` |
| Dashboard | [Test dashboard](https://dashboard.stripe.com/acct_1Ti6CMIQWmyptLnb/test/dashboard) |

Test mode must stay ON (switch in the top right of the Stripe Dashboard).

## Confirmed prices (do not use $499 / $1,299 or $49 training)

**List** (public at `/pricing`):

- $125 per active staff / month (1–19 clients)
- $109 / staff at 20–49 clients, $99 / staff at 50+
- $500 / month minimum
- Annual = 20% off
- Enterprise = contact us (no dollar amount in Stripe)

**Founding** (first 5 paying companies, 12 months, then list):

- $79 per staff / month
- $299 / month minimum
- Hive Exec can mark a company founding vs list

**Exempt:** True North Supports LLC is billing-exempt forever. Never charge seats or training. Hive Exec can toggle exempt on other companies. Dane’s `danewarnick@gmail` test companies are **not** auto-exempt — they pay unless he comps them.

**Training** (one-time per staff; Mandt name stays):

- Full program $300
- CPR/First Aid $75, Mandt $200, DSPD required $100
- TNS / exempt skip these

Until you paste `price_` IDs, Checkout uses Stripe `price_data` at these amounts so you can still test.

## Products (create in test mode, then paste Price IDs)

| Product | Amount | Billing | Env var |
|---|---|---|---|
| Hive list / staff (1–19) | $125 | Recurring, monthly | `STRIPE_PRICE_STAFF_LIST_MONTHLY` |
| Hive list / staff annual | 20% off yearly | Recurring, yearly | `STRIPE_PRICE_STAFF_LIST_ANNUAL` |
| Hive list / staff (20–49) | $109 | Recurring, monthly | `STRIPE_PRICE_STAFF_LIST_20_MONTHLY` |
| Hive list / staff (50+) | $99 | Recurring, monthly | `STRIPE_PRICE_STAFF_LIST_50_MONTHLY` |
| Hive founding / staff | $79 | Recurring, monthly | `STRIPE_PRICE_STAFF_FOUNDING_MONTHLY` |
| Hive founding / staff annual | 20% off yearly | Recurring, yearly | `STRIPE_PRICE_STAFF_FOUNDING_ANNUAL` |
| Founding coupon (instead of a founding price) | — | Coupon | `STRIPE_COUPON_FOUNDING` |
| Annual 20% coupon (optional) | 20% off | Coupon | `STRIPE_COUPON_ANNUAL` |
| Training full program | $300 | One time | `STRIPE_PRICE_TRAINING_FULL` |
| Training CPR/First Aid | $75 | One time | `STRIPE_PRICE_TRAINING_CPR` |
| Training Mandt | $200 | One time | `STRIPE_PRICE_TRAINING_MANDT` |
| Training DSPD required | $100 | One time | `STRIPE_PRICE_TRAINING_DSPD` |

Do **not** create or wire $499 Pro, $1,299 Enterprise, or $49 training extras.

## Environment variables (Vercel / Lovable)

Never paste these into GitHub. Test keys only (`sk_test_` / `pk_test_`).

- `STRIPE_SECRET_KEY` — `sk_test_…` (Developers → API keys)
- `STRIPE_PUBLISHABLE_KEY` — `pk_test_…`
- `STRIPE_WEBHOOK_SECRET` — `whsec_…` (from the webhook below)
- The `STRIPE_PRICE_*` and `STRIPE_COUPON_*` values above — placeholders until you paste them

If the secret key is missing, True North can still log in. New agencies see a clear “payments are not set up” message instead of a crash.

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

True North Supports LLC is marked **billing-exempt**. Hive Exec can check that same box on another company to comp them later — no code change. Hive Exec can also mark founding vs list.

## SQL you must run

Paste these blocks from the top of `docs/SQL_HANDOFF.md` into Lovable’s SQL editor (clear the editor first, one block at a time):

1. **Stripe billing: founding vs list**
2. **Stripe billing: never charge True North** (if you have not already)
