## Problem

The `/reset-password` page calls `supabase.auth.updateUser({ password })` directly, but does nothing to establish a session from the recovery link. When the user clicks the email link, Supabase redirects to `/reset-password#access_token=...&type=recovery` (or `?code=...` for PKCE flow). The client must either:

- detect the PASSWORD_RECOVERY event from `onAuthStateChange`, or
- call `supabase.auth.exchangeCodeForSession(code)` when a `?code=` is present.

Without that, there is no session → `updateUser` throws **"Auth session missing!"**.

A second contributing factor: `AuthProvider` clears the React Query cache on every identity change. The recovery link establishes a brand-new session on this tab, which is fine, but we need to make sure the reset page renders the form regardless and surfaces a clear error if the link is expired/invalid.

## Fix (single file: `src/routes/reset-password.tsx`)

1. On mount, inspect the URL:
   - If `window.location.search` contains `code`, call `supabase.auth.exchangeCodeForSession(code)`. On success, clean the URL (`history.replaceState`).
   - Else if `window.location.hash` contains `type=recovery` with `access_token` + `refresh_token`, call `supabase.auth.setSession({ access_token, refresh_token })`, then clean the hash.
   - Also subscribe to `supabase.auth.onAuthStateChange`; treat `PASSWORD_RECOVERY` as "ready".
2. Track three states: `verifying`, `ready`, `error`.
   - `verifying` → show "Verifying reset link…"
   - `error` → show "This reset link is invalid or has expired" + link back to `/forgot-password`.
   - `ready` → show the existing new-password form.
3. Keep the existing `updateUser({ password })` + `must_change_password=false` update + redirect to `/dashboard`. No other behavior changes.
4. No changes to `forgot-password.tsx` — it already passes the correct `redirectTo`.

## Out of scope

- No backend/SQL changes.
- No changes to `AuthProvider`, router, or other routes.
- No change to the email template or Supabase auth config.

## Verify

- Request a reset for `trueblueprobert@gmail.com` from `/forgot-password`.
- Open the email link → lands on `/reset-password`, briefly shows "Verifying…", then the form.
- Submit a new password → success toast, redirected to `/dashboard`.
- Open a stale/expired link → friendly "invalid or expired" message, no console crash.
