# Deadlines page — surgical cleanup

Three targeted fixes. No rebuilds. Working parts (summary completion, SEI UPI attestation, staff certs, incident clocks, billing-code rows) stay untouched.

## Fix 1 — Remove the HHS monthly certification source

In `src/hooks/use-deadlines.tsx`:

- Drop the `"hhs_cert"` branch in the `items` builder (the loop that pushes `HHS monthly certification — …`).
- Drop the now-unused `hhs_monthly_certifications` query block inside `hhsQ` — but keep `hhsQ.activeIds` because the **annual** host-home-cert source still depends on it. Simplify `hhsQ` to only return `{ activeIds }`.
- Remove `"hhs_cert"` from the `DeadlineSource` union.

In `src/routes/dashboard.deadlines.tsx`:

- Remove the `hhs_cert` entries from `sourceIcon` and `sourceLabel` maps.

Result: HHS appears exactly once on the Deadlines page, as the **annual** host-home-cert row driven by `host_home_certifications.next_due_date`.

## Fix 2 — Every item links to the right place

In `use-deadlines.tsx`, ensure every pushed item has a usable `href`:

| Source | Current | New `href` |
|---|---|---|
| `summary` | none | `/dashboard/summaries?open=<summary.id>` (the page already accepts `?open=<uuid>` and auto-opens that summary dialog) |
| `host_home_cert` | `/dashboard/hub/employees?tab=hosts` | keep — that's the Host Home Providers board |
| `staff_cert` | `/dashboard/employees/$staffId` | keep |
| `incident` | `/dashboard/hub/documentation?tab=incidents` | keep |
| `billing_code` | `/dashboard/behavior-support/$clientId` | keep |

In `dashboard.deadlines.tsx`'s `RowAction`:

- Summaries already render their own action button (Mark complete / Entered into UPI) — leave those exactly as-is.
- For every other source, `RowAction` already falls through to the "Open →" button when `item.href` is set. With Fix 2's summary `href` now populated, the row's **title** also needs to be clickable as a fallback. Wrap the title text inside `DeadlineRow` in an `<a href={item.href}>` when `href` is set, so the whole row name navigates too (small win, keeps the open button for summary action). Use `<Link to={item.href}>` is not possible without parsing — use a plain `<a>` since we already use `<a>` in the existing "Open" button.

No other UI restructuring.

## Fix 3 — Home dashboard Deadlines card

`DeadlinesHomeCard` is already exported from `dashboard.deadlines.tsx` and already imported + rendered in `src/routes/dashboard.index.tsx` (line 142). Verify it renders, no changes needed. If during testing the card is missing on the current Home layout, re-add the `<DeadlinesHomeCard />` placement to match neighboring card styling.

## Verification

1. Load `/dashboard/deadlines` — confirm zero "HHS monthly certification — …" rows; the only HHS row is the annual "Host home annual certification".
2. Click a summary row's title → opens `/dashboard/summaries?open=<id>` with that summary's dialog open.
3. Click each other row type → lands on the documented destination.
4. Confirm summary action buttons (Mark complete, Entered into UPI) still work — untouched.
5. Open `/dashboard` Home — confirm Deadlines card shows overdue + due-this-week counts and links to `/dashboard/deadlines`.
