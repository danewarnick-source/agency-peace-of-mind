# Stripe test-mode setup (Dane)

Hive charges companies in **Stripe test mode only** right now. No real cards are charged.

## 1. Open Stripe (test mode)

1. Go to [https://dashboard.stripe.com](https://dashboard.stripe.com) and sign in.
2. Turn **Test mode** ON (switch in the top right). It must stay on.

## 2. Create two products

In **Product catalog → Add product**:

| Product name | Price | Billing |
|---|---|---|
| Hive Pro | $499 USD | Recurring, monthly |
| Hive Enterprise | $1,299 USD | Recurring, monthly |

After you save each price, copy the **Price ID** (starts with `price_`).

Optional extra training product (only if you want a saved Stripe price for the full training program):

| Product name | Price | Billing |
|---|---|---|
| Hive Training — Full program | $300 USD | One time |

À-la-carte courses (CPR, Mandt, DSPD) do not need saved prices. Hive sends the amount to Stripe at checkout.

## 3. Add keys to the host (Vercel / Lovable)

Never paste these into GitHub. Add them as environment variables:

- `STRIPE_SECRET_KEY` — starts with `sk_test_` (Developers → API keys)
- `STRIPE_PUBLISHABLE_KEY` — starts with `pk_test_`
- `STRIPE_WEBHOOK_SECRET` — starts with `whsec_` (from the webhook below)
- `STRIPE_PRICE_PRO` — Price ID for Hive Pro
- `STRIPE_PRICE_ENTERPRISE` — Price ID for Hive Enterprise
- `STRIPE_PRICE_TRAINING_FULL` — optional Price ID for the full training program

If these are missing, True North can still log in. New agencies see a clear “payments are not set up” message instead of a crash.

## 4. Webhook

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

## 5. Test card

On any paywall that says **TEST MODE**:

- Card: `4242 4242 4242 4242`
- Expiry: any future date
- CVC: any 3 digits
- ZIP: any ZIP

## 6. True North is never charged

True North Supports LLC is marked **billing-exempt**. Hive Exec can check that same box on another company to comp them later — no code change.

## 7. SQL you must run

Paste the **Stripe billing: never charge True North** block at the top of `docs/SQL_HANDOFF.md` into Lovable’s SQL editor (clear the editor first). Until that runs, the exempt checkbox has no database column.
