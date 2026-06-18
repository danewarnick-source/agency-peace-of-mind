# Make the signup verification code email for real

The signup page logic is already correct — it calls `supabase.auth.signUp` and verifies with `supabase.auth.verifyOtp({ type: "email" })`. Nothing is wrong in `src/routes/signup.tsx`. The reason no email arrives is that this project has no email sender configured, and the default auth email shows a magic-link button instead of the 6-digit code your UI asks for.

## Step 1 — Set up an email sender domain

Email goes out from your own brand (e.g. `notify.yourdomain.com`) so it lands in real inboxes instead of spam. This is a one-time setup: you'll click through a dialog, paste two NS records at your DNS registrar, and Lovable handles SPF/DKIM/MX from there. DNS verification can take a bit, but we can do the rest of the setup in parallel.

If you'd rather not use your own domain yet, Lovable can still send from a default Lovable address for testing — tell me and I'll go that route instead.

## Step 2 — Scaffold the auth email templates with a 6-digit code

Once a domain is attached (even if DNS is still verifying), I'll generate the six auth email templates (signup, magic link, password reset, invite, email change, reauthentication) and edit the **signup** template to render the 6-digit token (`{{ .Token }}`) prominently — that's the code the user types into Step 2 of your existing signup wizard. I'll style them to match the Hive brand (dark surface, amber accent, your logo).

No changes to `src/routes/signup.tsx` are required — the existing `verifyOtp` call already accepts the 6-digit code.

## Step 3 — Verify end-to-end

After DNS verifies, I'll send a test signup to confirm:
- the email actually arrives
- it shows the 6-digit code (not just a link)
- entering that code on Step 2 completes verification and moves the wizard forward

## What I will NOT change

- Signup wizard UI, steps, or validation
- The Supabase auth flow itself
- Any unrelated routes or templates
- The Hive-exec / NECTAR work from earlier turns

## Technical notes

- Tools used: `email_domain` setup dialog → `email_domain--scaffold_auth_email_templates`. No edge functions, no third-party provider (Resend/SendGrid), no new secrets.
- Templates live in `supabase/functions/_shared/email-templates/*.tsx` after scaffolding; the signup one will include the `{{ .Token }}` block.
- Auth emails route through Lovable's managed queue (`auth_emails` pgmq), so retries and deliverability are handled.

## One thing I need from you

Do you want to use **your own domain** (best deliverability, requires adding two NS records at your registrar), or **send from a default Lovable test address** for now and switch to your domain later?
