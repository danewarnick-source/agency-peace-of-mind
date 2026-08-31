import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CANONICAL_SITE_ORIGIN,
  RESET_PASSWORD_PATH,
  VERCEL_PREVIEW_ORIGIN,
  authRedirectUrl,
  isLovableAuthHost,
  isSafeAuthOrigin,
  normalizeOrigin,
  passwordResetRedirectUrl,
  resolveAuthOrigin,
  sanitizeAuthRedirectUrl,
} from "./auth-redirect.ts";

describe("isLovableAuthHost", () => {
  it("flags lovable.app / lovable.dev and their subdomains", () => {
    assert.equal(isLovableAuthHost("agency-peace-of-mind.lovable.app"), true);
    assert.equal(isLovableAuthHost("id-preview-7c0aa2f3--4bb83c55.lovable.app"), true);
    assert.equal(isLovableAuthHost("lovable.dev"), true);
    assert.equal(isLovableAuthHost("preview.lovable.dev"), true);
    assert.equal(isLovableAuthHost("hivecertify.com"), false);
    assert.equal(isLovableAuthHost("agency-peace-of-mind.vercel.app"), false);
    assert.equal(isLovableAuthHost("localhost"), false);
  });
});

describe("normalizeOrigin / isSafeAuthOrigin", () => {
  it("strips paths and rejects Lovable hosts", () => {
    assert.equal(normalizeOrigin("https://hivecertify.com/reset-password"), "https://hivecertify.com");
    assert.equal(normalizeOrigin("agency-peace-of-mind.vercel.app"), "https://agency-peace-of-mind.vercel.app");
    assert.equal(isSafeAuthOrigin("https://hivecertify.com"), true);
    assert.equal(isSafeAuthOrigin("https://agency-peace-of-mind.vercel.app"), true);
    assert.equal(isSafeAuthOrigin("https://agency-peace-of-mind.lovable.app"), false);
    assert.equal(isSafeAuthOrigin(""), false);
  });
});

describe("resolveAuthOrigin / authRedirectUrl", () => {
  it("keeps hivecertify.com and the Vercel preview host", () => {
    assert.equal(resolveAuthOrigin("https://hivecertify.com"), CANONICAL_SITE_ORIGIN);
    assert.equal(resolveAuthOrigin(VERCEL_PREVIEW_ORIGIN), VERCEL_PREVIEW_ORIGIN);
    assert.equal(
      passwordResetRedirectUrl("https://hivecertify.com"),
      `https://hivecertify.com${RESET_PASSWORD_PATH}`,
    );
    assert.equal(
      passwordResetRedirectUrl("https://agency-peace-of-mind.vercel.app"),
      "https://agency-peace-of-mind.vercel.app/reset-password",
    );
  });

  it("rewrites a Lovable candidate to hivecertify.com", () => {
    assert.equal(
      resolveAuthOrigin("https://agency-peace-of-mind.lovable.app"),
      CANONICAL_SITE_ORIGIN,
    );
    assert.equal(
      passwordResetRedirectUrl("https://id-preview.lovable.app"),
      "https://hivecertify.com/reset-password",
    );
  });

  it("never returns a Lovable origin when nothing safe is passed (SSR)", () => {
    const origin = resolveAuthOrigin("");
    assert.equal(isSafeAuthOrigin(origin), true);
    assert.equal(isLovableAuthHost(new URL(origin).hostname), false);
    assert.equal(resolveAuthOrigin(null), origin);
    assert.ok(authRedirectUrl("/signup", "").endsWith("/signup"));
    assert.doesNotMatch(authRedirectUrl("/signup", ""), /lovable\.(app|dev)/);
  });
});

describe("sanitizeAuthRedirectUrl", () => {
  it("rewrites Lovable reset links and keeps the existing path", () => {
    assert.equal(
      sanitizeAuthRedirectUrl("https://agency-peace-of-mind.lovable.app/reset-password"),
      "https://hivecertify.com/reset-password",
    );
    assert.equal(
      sanitizeAuthRedirectUrl(
        "https://preview.lovable.dev/audit-portal/set-password?packageId=abc",
      ),
      "https://hivecertify.com/audit-portal/set-password?packageId=abc",
    );
  });

  it("leaves hivecertify.com and Vercel URLs alone", () => {
    assert.equal(
      sanitizeAuthRedirectUrl("https://hivecertify.com/reset-password"),
      "https://hivecertify.com/reset-password",
    );
    assert.equal(
      sanitizeAuthRedirectUrl("https://agency-peace-of-mind.vercel.app/reset-password"),
      "https://agency-peace-of-mind.vercel.app/reset-password",
    );
  });
});

describe("auth email call sites do not hardcode Lovable", () => {
  it("forgot-password uses passwordResetRedirectUrl", () => {
    const src = readFileSync(new URL("../routes/forgot-password.tsx", import.meta.url), "utf8");
    assert.match(src, /passwordResetRedirectUrl/);
    assert.match(src, /resetPasswordForEmail/);
    assert.doesNotMatch(src, /lovable\.(app|dev)/);
  });

  it("signup / auditor / hive-exec invite use the shared helper", () => {
    const signup = readFileSync(new URL("../routes/signup.tsx", import.meta.url), "utf8");
    const auditor = readFileSync(new URL("../routes/auditor.tsx", import.meta.url), "utf8");
    const hiveExec = readFileSync(new URL("./hive-exec-admin.functions.ts", import.meta.url), "utf8");
    assert.match(signup, /authRedirectUrl\("\/signup"\)/);
    assert.match(auditor, /authRedirectUrl\("\/auditor"\)/);
    assert.match(hiveExec, /passwordResetRedirectUrl/);
    assert.match(hiveExec, /inviteUserByEmail/);
  });

  it("auth-send-email rewrites Lovable redirect_to before building the link", () => {
    const src = readFileSync(
      new URL("../../supabase/functions/auth-send-email/index.ts", import.meta.url),
      "utf8",
    );
    assert.match(src, /sanitizeRedirectTo/);
    assert.match(src, /hivecertify\.com/);
    assert.match(src, /lovable\.app/);
    assert.match(src, /redirect_to: sanitizeRedirectTo/);
  });
});
