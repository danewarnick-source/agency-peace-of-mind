import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE,
  SIGNUP_CHECKOUT_CONFIRM_MESSAGE,
  SIGNUP_CHECKOUT_START_MESSAGE,
  SIGNUP_EMAIL_CONFIRM_DENIED_MESSAGE,
  humanizeCheckoutConfirmError,
  humanizeCheckoutStartError,
  signupAuthCallbackError,
} from "./signup-checkout-error.ts";

describe("humanizeCheckoutStartError", () => {
  it("maps Missing Supabase environment variable(s) to a real sentence, not {}", () => {
    assert.equal(
      humanizeCheckoutStartError(
        new Error(
          "Missing Supabase environment variable(s): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Connect Supabase in Lovable Cloud.",
        ),
      ),
      SIGNUP_CHECKOUT_START_MESSAGE,
    );
    assert.doesNotMatch(humanizeCheckoutStartError({}), /^\{\}$/);
    assert.equal(humanizeCheckoutStartError({}), SIGNUP_CHECKOUT_START_MESSAGE);
  });

  it("does not invent a SERVICE_ROLE name in the toast", () => {
    const text = humanizeCheckoutStartError(
      new Error("Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY"),
    );
    assert.doesNotMatch(text, /SERVICE_ROLE/);
    assert.equal(text, SIGNUP_CHECKOUT_START_MESSAGE);
  });

  it("keeps a signed-out sentence", () => {
    assert.equal(
      humanizeCheckoutStartError(new Error("Not signed in.")),
      "Session lost — please sign in again.",
    );
  });
});

describe("humanizeCheckoutConfirmError", () => {
  it("names SUPABASE_SERVICE_ROLE_KEY when the paid write cannot run", () => {
    assert.match(
      humanizeCheckoutConfirmError(
        new Error("Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY"),
      ),
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    assert.equal(
      humanizeCheckoutConfirmError(new Error(PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE)),
      PAID_SUBSCRIPTION_NEEDS_SERVICE_ROLE,
    );
    assert.equal(
      humanizeCheckoutConfirmError(new Error("new row violates row-level security policy")),
      SIGNUP_CHECKOUT_CONFIRM_MESSAGE,
    );
    assert.doesNotMatch(humanizeCheckoutConfirmError({}), /^\{\}$/);
  });
});

describe("signupAuthCallbackError", () => {
  it("reads access_denied / otp hash without treating a session hash as denied", () => {
    assert.equal(
      signupAuthCallbackError("", "#error=access_denied&error_code=otp_expired"),
      SIGNUP_EMAIL_CONFIRM_DENIED_MESSAGE,
    );
    assert.equal(
      signupAuthCallbackError("?error=access_denied", ""),
      SIGNUP_EMAIL_CONFIRM_DENIED_MESSAGE,
    );
    assert.equal(signupAuthCallbackError("", "#access_token=abc&refresh_token=def"), null);
  });
});

describe("Payment and lock paths use VITE_ session env", () => {
  it("createSubscriptionCheckoutFn does not touch supabaseAdmin", () => {
    const checkout = readFileSync(new URL("./stripe-checkout.functions.ts", import.meta.url), "utf8");
    const start = checkout.indexOf("export const createSubscriptionCheckoutFn");
    const end = checkout.indexOf("export const createPortalSessionFn");
    assert.ok(start >= 0 && end > start);
    const handler = checkout.slice(start, end);
    assert.doesNotMatch(handler, /supabaseAdmin/);
    assert.match(handler, /billingDb\(context\.supabase\)/);
    assert.match(handler, /humanizeCheckoutStartError/);
  });

  it("signup Payment toasts the humanized checkout sentence", () => {
    const page = readFileSync(new URL("../routes/signup.tsx", import.meta.url), "utf8");
    assert.match(page, /humanizeCheckoutStartError/);
    assert.match(page, /signupAuthCallbackError/);
    assert.doesNotMatch(page, /toast\.error\(\(e as Error\)\.message\)/);
  });

  it("getBillingLockFn reads the session first and does not require service role", () => {
    const lock = readFileSync(new URL("./billing-lock.functions.ts", import.meta.url), "utf8");
    assert.match(lock, /readSupabaseAdminEnv/);
    assert.match(lock, /readLockSub\(context\.supabase/);
    assert.match(lock, /VITE_SUPABASE_URL/);
    assert.doesNotMatch(lock, /throw new Error\("Missing Supabase environment variable/);
  });
});
