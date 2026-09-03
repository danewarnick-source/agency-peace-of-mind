import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  SIGNUP_ACCOUNT_GENERIC_MESSAGE,
  SIGNUP_AGREEMENT_SAVE_FAILED_MESSAGE,
  SIGNUP_EMAIL_IN_USE_MESSAGE,
  extractSignupErrorText,
  humanizeSignupAccountError,
  isAlreadyUsedEmailError,
} from "./signup-account-error.ts";

describe("extractSignupErrorText", () => {
  it("does not stringify an empty object as {}", () => {
    assert.equal(extractSignupErrorText({}), "");
    assert.equal(extractSignupErrorText(new Error("{}")), "");
    assert.equal(extractSignupErrorText("{ }"), "");
    assert.equal(humanizeSignupAccountError({}), SIGNUP_ACCOUNT_GENERIC_MESSAGE);
    assert.equal(humanizeSignupAccountError("{}"), SIGNUP_ACCOUNT_GENERIC_MESSAGE);
    assert.doesNotMatch(humanizeSignupAccountError({}), /^\{\}$/);
  });

  it("digs Auth / server-fn nested message and code", () => {
    assert.match(
      extractSignupErrorText({ error: { message: "User already registered", code: "user_already_exists" } }),
      /already registered/i,
    );
    assert.equal(
      extractSignupErrorText({ data: { message: "duplicate key value" } }),
      "duplicate key value",
    );
  });
});

describe("humanizeSignupAccountError", () => {
  it("says the email is already in use for known Auth duplicate shapes", () => {
    assert.equal(isAlreadyUsedEmailError({ message: "User already registered" }), true);
    assert.equal(humanizeSignupAccountError({ message: "User already registered" }), SIGNUP_EMAIL_IN_USE_MESSAGE);
    assert.equal(
      humanizeSignupAccountError({ error: { code: "user_already_exists" } }),
      SIGNUP_EMAIL_IN_USE_MESSAGE,
    );
    assert.equal(
      humanizeSignupAccountError(new Error("A user with this email already exists")),
      SIGNUP_EMAIL_IN_USE_MESSAGE,
    );
  });

  it("maps a missing legal_attestations table to a stay-on-page sentence", () => {
    assert.equal(
      humanizeSignupAccountError({
        message: 'relation "public.legal_attestations" does not exist',
        code: "42P01",
      }),
      SIGNUP_AGREEMENT_SAVE_FAILED_MESSAGE,
    );
  });

  it("does not echo raw SQL or empty objects", () => {
    assert.equal(
      humanizeSignupAccountError("new row violates check constraint invitations_role_check"),
      SIGNUP_ACCOUNT_GENERIC_MESSAGE,
    );
    assert.doesNotMatch(humanizeSignupAccountError({ foo: 1 }), /^\{\}/);
  });
});

describe("signup Account wiring", () => {
  it("opens Terms and BAA in a new tab and humanizes Create account errors", () => {
    const signup = readFileSync(new URL("../routes/signup.tsx", import.meta.url), "utf8");
    const account = signup.slice(
      signup.indexOf("function Step1Account"),
      signup.indexOf("function Step3Business"),
    );
    assert.match(account, /humanizeSignupAccountError/);
    assert.match(account, /isAlreadyUsedEmailError/);
    assert.match(account, /href="\/terms"/);
    assert.match(account, /href="\/baa"/);
    assert.match(account, /target="_blank"/);
    assert.match(account, /rel="noopener noreferrer"/);
    assert.doesNotMatch(account, /<Link\s+to="\/terms"/);
    assert.doesNotMatch(account, /<Link\s+to="\/baa"/);
    assert.doesNotMatch(account, /Just need training\?/);
  });
});
