# Stripe test-mode setup (Dane)

Hive charges companies in **Stripe test / sandbox only**. No real cards are charged. Do not switch this to live keys.

## New-provider signup walk (`/signup`)

This is the walk Dane repeats with Gmail plus-aliases (`danewarnick+pi1@gmail.com`, `+pi2`, …).

- **Plan:** $69 per client / month, **$350 minimum**. After a roster exists, the platform bills the **high-water** count for the month (`clients.created_at` + `clients.discharge_date`) and sets the Stripe quantity. Signup’s client number is an estimate only. Checkout uses the TEST catalog Price IDs (`pi_list_per_client` × client count, **or** `pi_list_minimum` when the floor applies — never both). It does **not** use the old $125 / staff sandbox Price IDs.
- **No founding dollars** on the form. New agencies on this walk are list, not $79 / $299.
- **Training (optional, skip allowed):** per-person roster — name + one of CPR / First Aid $100, 30-day $75, Mandt $200, or Pack $300. Pack is exclusive for that person. Stripe quantities are the count of people on each SKU (example: 1× CPR, 3× Pack, 1× thirty-day). Skip sends no training lines. Same Checkout as the plan.
- **TEST MODE card:** `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
- **Plus-aliases are distinct users.** The unique-email guard still blocks the exact same address. Do not treat `danewarnick@gmail.com` and `danewarnick+pi1@gmail.com` as the same.
- **True North Supports stays comped.** Do not name the test agency “True North Supports” (that name is billing-exempt).
- **Live keys are blocked.** If the host has `sk_live_`, Checkout fails closed and tells you to use a preview URL with `sk_test_` / `pk_test_`. Prefer [providerinterface.com](https://providerinterface.com/signup) only when that host is also TEST MODE. If production Stripe is live, use the PR preview.

Old $125 / staff and founding $79 products below are leftover sandbox catalog IDs. They are not what `/signup`, billing-locked, or the in-app subscription page charges.

## Linked account

| | |
|---|---|
| Name | Hive sandbox / Hive |
| Account id | `acct_1Ti6CMIQWmyptLnb` |
| Dashboard | [Test dashboard](https://dashboard.stripe.com/acct_1Ti6CMIQWmyptLnb/test/dashboard) |

Test mode must stay ON (switch in the top right of the Stripe Dashboard).

## Confirmed prices

**List** (public at `/pricing`, `/signup`, and in-app pay):

- **$69 per client / month**
- **$350 / month minimum**
- Enterprise = contact us (no dollar amount in Stripe)

Leftover Hive staff math ($125 / $109 / $99, $500 min, founding $79 / $299) stays in `hive-pricing.ts` only. Do not show it or charge it.

**Exempt:** True North Supports LLC is billing-exempt forever. Never charge seats or training. Hive Exec can toggle exempt on other companies. Dane’s `danewarnick@gmail` test companies are **not** auto-exempt — they pay unless he comps them.

**Training** (one-time per staff; Mandt name stays):

- Package $300 (saves $75 vs $375)
- CPR/First Aid $100, Mandt $200, 30-day orientation $75
- CPR and Mandt are external classes (admin roster → one Hive Executive alert)
- 30-day is the in-Hive course from My Obligations (not an external class)
- TNS / exempt skip these — always $0

## Sandbox products (already created)

These **Price IDs** are test-mode identifiers on `acct_1Ti6CMIQWmyptLnb`. Hive uses them as defaults. You can still override them with env vars. They are not secrets.

| Product | Amount | Product id | Price id | Env var |
|---|---|---|---|---|
| Hive seat list | $125 / month | `prod_V9XjHA2R4jLnn3` | `price_1U9EeRIQWMytpLnbNurGi0Vq` | `STRIPE_PRICE_SEAT_LIST` |
| Hive seat founding | $79 / month | `prod_V9XmH5qQO0TjHi` | `price_1U9EgWIQWMytpLnbyBvs2f4L` | `STRIPE_PRICE_SEAT_FOUNDING` |
| PI list per client | $69 / month | — | `price_1UBNUYIQWMytpLnbpygoWdLw` | `STRIPE_PRICE_PI_LIST_PER_CLIENT` |
| PI list minimum | $350 / month | — | `price_1UBNUYIQWMytpLnbpDKqVRhB` | `STRIPE_PRICE_PI_LIST_MINIMUM` |
| Training package (legacy hive) | $300 one-time | `prod_V9Xn9njjImRO15` | `price_1U9EhyIQWMytpLnbg2nkCFd8` | `STRIPE_PRICE_TRAINING_FULL` |
| Training Pack (PI list signup) | $300 one-time | — | `price_1UBNeDIQWMytpLnbUy61NTkr` | `STRIPE_PRICE_TRAINING_PACK` |
| Training Mandt | $200 one-time | — | `price_1UBNbjIQWMytpLnbRJlOEOpM` | `STRIPE_PRICE_TRAINING_MANDT` |
| Training CPR/First Aid | $100 one-time | — | `price_1UBNX2IQWMytpLnb5aoUlkAt` | `STRIPE_PRICE_TRAINING_CPR` |
| Training 30-day | $75 one-time | — | `price_1UBNZHIQWMytpLnbRsc9uWlG` | `STRIPE_PRICE_TRAINING_THIRTY_DAY` |

Do **not** put leftover Hive seat Price IDs (`STRIPE_PRICE_SEAT_LIST` / `STRIPE_PRICE_SEAT_FOUNDING`) on agency Checkout line items.

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
- `STRIPE_PRICE_PI_LIST_PER_CLIENT`
- `STRIPE_PRICE_PI_LIST_MINIMUM`
- `STRIPE_PRICE_TRAINING_FULL`
- `STRIPE_PRICE_TRAINING_PACK`
- `STRIPE_PRICE_TRAINING_CPR`
- `STRIPE_PRICE_TRAINING_MANDT`
- `STRIPE_PRICE_TRAINING_THIRTY_DAY`
- `STRIPE_PRICE_TRAINING_DSPD` — leftover alias for the 30-day price

Class roster checkout always sends Stripe `price_data` at the locked amounts, so a stale $75 CPR Price ID cannot undercharge.

Public `/training` (training-only, no office) uses the same TEST catalog Price IDs
(CPR / 30-day / Mandt / Pack). Quantities = people on each SKU. No $69 / $350
subscription line. Webhook `hive_kind=training_only` marks the order paid and
lists each person on Hive Executive Training.

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
