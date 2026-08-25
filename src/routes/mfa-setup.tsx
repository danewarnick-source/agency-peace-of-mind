/**
 * MFA is disabled until real PHI launch. Planned replacement: email OTP
 * after password (option C), not authenticator-app TOTP.
 * Keep this route so old bookmarks / redirects do not 404 — send people home.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/mfa-setup")({
  head: () => ({ meta: [{ title: "Sign in — HIVE" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => null,
});
