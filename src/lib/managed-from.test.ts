import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEFAULT_MANAGED_FROM_ADDRESS,
  DEFAULT_MANAGED_FROM_NAME,
  extractEmailAddress,
  formatFromHeader,
  managedFromAddress,
  stripFakeDisplayLabel,
} from "./managed-from.ts";

const FROM_RAILS = [
  new URL("./email.functions.ts", import.meta.url),
  new URL("./audit-portal.functions.ts", import.meta.url),
  new URL("./training-only-exec.functions.ts", import.meta.url),
  new URL("../routes/dashboard.settings.email.tsx", import.meta.url),
  new URL("../../supabase/functions/auth-send-email/index.ts", import.meta.url),
  new URL("../../supabase/functions/send-email/index.ts", import.meta.url),
];

describe("extractEmailAddress", () => {
  it("accepts a bare mailbox", () => {
    assert.equal(extractEmailAddress("noreply@providerinterface.com"), "noreply@providerinterface.com");
  });

  it("pulls the address out of a Name <addr> header", () => {
    assert.equal(
      extractEmailAddress("Provider Interface <noreply@providerinterface.com>"),
      "noreply@providerinterface.com",
    );
  });

  it("rejects Resend-looking junk without an at-sign", () => {
    assert.equal(extractEmailAddress("not-an-address"), undefined);
  });
});

describe("managedFromAddress", () => {
  it("falls back to noreply@providerinterface.com", () => {
    assert.equal(managedFromAddress({}), DEFAULT_MANAGED_FROM_ADDRESS);
    assert.equal(DEFAULT_MANAGED_FROM_ADDRESS, "noreply@providerinterface.com");
  });

  it("prefers RESEND_FROM over EMAIL_FROM", () => {
    assert.equal(
      managedFromAddress({
        RESEND_FROM: "alerts@providerinterface.com",
        EMAIL_FROM: "other@example.com",
      }),
      "alerts@providerinterface.com",
    );
  });

  it("accepts EMAIL_FROM when RESEND_FROM is unset", () => {
    assert.equal(
      managedFromAddress({ EMAIL_FROM: "Provider Interface <ops@providerinterface.com>" }),
      "ops@providerinterface.com",
    );
  });

  it("ignores a malformed RESEND_FROM and uses the default", () => {
    assert.equal(managedFromAddress({ RESEND_FROM: "not-valid" }), DEFAULT_MANAGED_FROM_ADDRESS);
  });

  it("never returns @resend.dev, including a leftover sandbox env", () => {
    assert.doesNotMatch(managedFromAddress({}), /@resend\.dev/);
    assert.equal(managedFromAddress({ RESEND_FROM: "onboarding@resend.dev" }), DEFAULT_MANAGED_FROM_ADDRESS);
  });
});

describe("formatFromHeader", () => {
  it("uses Provider Interface as the default display name", () => {
    assert.equal(
      formatFromHeader(DEFAULT_MANAGED_FROM_NAME, DEFAULT_MANAGED_FROM_ADDRESS),
      "Provider Interface <noreply@providerinterface.com>",
    );
    assert.doesNotMatch(formatFromHeader("HIVE Notifications"), /Hive Certify/);
  });

  it("strips leftover (FAKE) test labels from the display name", () => {
    assert.equal(stripFakeDisplayLabel("True North Supports (FAKE)"), "True North Supports");
    assert.equal(
      formatFromHeader("True North Supports (FAKE)", DEFAULT_MANAGED_FROM_ADDRESS),
      "True North Supports <noreply@providerinterface.com>",
    );
  });
});

describe("app and edge From rails", () => {
  it("do not hardcode @resend.dev or Hive Certify as From", () => {
    for (const url of FROM_RAILS) {
      const src = readFileSync(url, "utf8");
      assert.doesNotMatch(src, /from:\s*["'`][^"'`]*@resend\.dev/i);
      assert.doesNotMatch(src, /from:\s*["'`][^"'`]*Hive Certify/i);
      assert.doesNotMatch(src, /HIVE Notifications <onboarding@resend\.dev>/);
      assert.doesNotMatch(src, /HIVE State Audit <onboarding@resend\.dev>/);
    }
  });
});
