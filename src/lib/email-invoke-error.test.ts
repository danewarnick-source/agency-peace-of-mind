import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeEmailInvokeFailure } from "./email-invoke-error.ts";

describe("describeEmailInvokeFailure", () => {
  it("maps a missing send-email function (404) instead of the generic non-2xx toast", () => {
    assert.equal(
      describeEmailInvokeFailure(
        { message: "Edge Function returned a non-2xx status code", context: { status: 404 } },
        null,
      ),
      "Email sending isn't installed on this environment yet (send-email function missing).",
    );
  });

  it("maps the gateway 'function was not found' body", () => {
    assert.equal(
      describeEmailInvokeFailure({
        message: "Edge Function returned a non-2xx status code",
        context: { message: "Requested function was not found" },
      }),
      "Email sending isn't installed on this environment yet (send-email function missing).",
    );
  });

  it("maps a missing RESEND_API_KEY", () => {
    assert.equal(
      describeEmailInvokeFailure(
        { message: "Edge Function returned a non-2xx status code", context: { status: 500 } },
        { error: "RESEND_API_KEY not configured" },
      ),
      "Email sending isn't configured (RESEND_API_KEY missing on send-email).",
    );
  });

  it("maps an unverified Resend domain without echoing the recipient", () => {
    const text = describeEmailInvokeFailure(
      { message: "Edge Function returned a non-2xx status code", context: { status: 502 } },
      { error: "The providerinterface.com domain is not verified. You can only send to dane@tnsutah.com" },
    );
    assert.match(text, /From domain isn't verified in Resend/);
    assert.doesNotMatch(text, /dane@tnsutah\.com/);
  });

  it("strips addresses from unexpected Resend text", () => {
    assert.equal(
      describeEmailInvokeFailure(null, { error: "Mailbox full for nurse@example.com" }),
      "Mailbox full for [address]",
    );
  });

  it("does not repeat the opaque supabase-js non-2xx sentence", () => {
    assert.equal(
      describeEmailInvokeFailure({
        message: "Edge Function returned a non-2xx status code",
        context: { status: 502 },
      }),
      "Email send failed (HTTP 502).",
    );
  });
});
