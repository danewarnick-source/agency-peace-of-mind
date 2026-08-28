# Stripe test-mode setup (Dane)

Hive charges companies in **Stripe test / sandbox only**. No real cards are charged. Do not switch this to live keys.

## Linked account

| | |
|---|---|
| Name | Hive sandbox / Hive |
| Account id | `acct_1Ti6CMIQWmyptLnb` |
| Dashboard | [Test dashboard](https://dashboard.stripe.com/acct_1Ti6CMIQWmyptLnb/test/dashboard) |

Test mode must stay ON (switch in the top right of the Stripe Dashboard).

## Confirmed prices

**List** (public at `/pricing`):

- $125 per active staff / month (1–19 clients)
- $109 / staff at 20–49 clients, $99 / staff at 50+
- **$500 / month minimum** (4 seats at the $125 list price)
- Annual = 20% off
- Enterprise = contact us (no dollar amount in Stripe)

**Founding** (first 5 paying companies, 12 months, then list):

- $79 per staff / month
- **$299 / month minimum**
- Hive Exec can mark a company founding vs list

**Exempt:** True North Supports LLC is billing-exempt forever. Never charge seats or training. Hive Exec can toggle exempt on other companies. Dane’s `danewarnick@gmail` test companies are **not** auto-exempt — they pay unless he comps them.

**Training** (one-time per staff; Mandt name stays):

- Full program $300
- CPR/First Aid $75, Mandt $200, DSPD required $100
- TNS / exempt skip these

## Sandbox products (already created)

These **Price IDs** are test-mode identifiers on `acct_1Ti6CMIQWmyptLnb`. Hive uses them as defaults. You can still override them with env vars. They are not secrets.

| Product | Amount | Product id | Price id | Env var |
|---|---|---|---|---|
| Hive seat list | $125 / month | `prod_V9XjHA2R4jLnn3` | `price_1U9EeRIQWMytpLnbNurGi0Vq` | `STRIPE_PRICE_SEAT_LIST` |
| Hive seat founding | $79 / month | `prod_V9XmH5qQO0TjHi` | `price_1U9EgWIQWMytpLnbyBvs2f4L` | `STRIPE_PRICE_SEAT_FOUNDING` |
| Training full program | $300 one-time | `prod_V9Xn9njjImRO15` | `price_1U9EhyIQWMytpLnbg2nkCFd8` | `STRIPE_PRICE_TRAINING_FULL` |
| Training CPR/First Aid | $75 one-time | `prod_V9XpZpdcbeJXye` | `price_1U9EjNIQWMytpLnbPnfRb6Yz` | `STRIPE_PRICE_TRAINING_CPR` |
| Training Mandt | $200 one-time | `prod_V9XqoHqzqR8JaY` | `price_1U9EkmIQWMytpLnb2coYT0rn` | `STRIPE_PRICE_TRAINING_MANDT` |
| Training DSPD required | $100 one-time | `prod_V9Xr6M8IBuGzQK` | `price_1U9Em5IQWMytpLnb2of9BFOj` | `STRIPE_PRICE_TRAINING_DSPD` |

Volume rates ($109 / $99) and annual (20% off) still use Stripe `price_data` until those products exist. The app still enforces the $500 list minimum and $299 founding minimum.

Do **not** create or wire $499 Pro, $1,299 Enterprise, or $49 training extras.

## Environment variables (Vercel / Lovable)

**Never paste secret keys into GitHub.** Test keys only (`sk_test_` / `pk_test_`).

Required (env-only — Hive does not invent these):

- `STRIPE_SECRET_KEY` — `sk_test_…` (Developers → API keys)
- `STRIPE_PUBLISHABLE_KEY` — `pk_test_…`
- `STRIPE_WEBHOOK_SECRET` — `whsec_…` (from the webhook below)

Optional overrides (defaults are the sandbox Price IDs above):

- `STRIPE_PRICE_SEAT_LIST`
- `STRIPE_PRICE_SEAT_FOUNDING`
- `STRIPE_PRICE_TRAINING_FULL`
- `STRIPE_PRICE_TRAINING_CPR`
- `STRIPE_PRICE_TRAINING_MANDT`
- `STRIPE_PRICE_TRAINING_DSPD`

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
