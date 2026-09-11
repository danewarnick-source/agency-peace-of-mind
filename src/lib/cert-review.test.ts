import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  canAcceptCertEvidence,
  certReviewAcceptBlockReason,
  certReviewStatus,
  certReviewStatusLabel,
  renewalDueFromExpiration,
  resolvedCertExpiration,
  usesCertExpirationCadence,
} from "./cert-review.ts";

describe("cert review rules", () => {
  it("disables accept when a cert-expiration clock has no detected or confirmed date", () => {
    const missing = {
      usesCertExpiration: true,
      extractedExpiresOn: null,
      confirmedExpiresOn: null,
    };
    assert.equal(canAcceptCertEvidence(missing), false);
    assert.match(certReviewAcceptBlockReason(missing) ?? "", /Confirm expiration/);
    assert.equal(resolvedCertExpiration(missing), null);
    assert.equal(renewalDueFromExpiration(null), null);
    assert.equal(renewalDueFromExpiration("2026-09-10"), "2026-09-10");
  });

  it("accepts after the admin confirms expiration, and uses extracted when present", () => {
    assert.equal(
      canAcceptCertEvidence({
        usesCertExpiration: true,
        extractedExpiresOn: "2026-10-02",
        confirmedExpiresOn: null,
      }),
      true,
    );
    assert.equal(
      resolvedCertExpiration({
        usesCertExpiration: true,
        extractedExpiresOn: "2026-10-02",
        confirmedExpiresOn: "2027-01-15",
      }),
      "2027-01-15",
    );
    assert.equal(
      canAcceptCertEvidence({
        usesCertExpiration: false,
        extractedExpiresOn: null,
        confirmedExpiresOn: null,
      }),
      true,
    );
  });

  it("never treats upload date as an expiration", () => {
    const fn = readFileSync(new URL("./company-obligations.functions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(fn, /renewal defaulted to/);
    assert.doesNotMatch(fn, /months from upload date/);
    assert.match(fn, /resolvedCertExpiration|renewalDueFromExpiration|canAcceptCertEvidence/);
    assert.match(fn, /manually_confirmed/);
  });

  it("labels awaiting review until accept or correction", () => {
    assert.equal(
      certReviewStatus({ nectarValidationStatus: "failed", instanceStatus: "pending" }),
      "awaiting_review",
    );
    assert.equal(certReviewStatusLabel("awaiting_review"), "Awaiting review");
    assert.equal(
      certReviewStatus({ nectarValidationStatus: "manually_confirmed", instanceStatus: "completed" }),
      "accepted",
    );
    assert.equal(
      certReviewStatus({
        nectarValidationStatus: "failed",
        instanceStatus: "pending",
        correctionRequested: true,
      }),
      "correction_requested",
    );
  });

  it("detects cert-expiration cadence from due_day_config", () => {
    assert.equal(usesCertExpirationCadence({ from: "cert_expiration", every_n_months: 24 }), true);
    assert.equal(usesCertExpirationCadence({ every_n_months: 24 }), true);
    assert.equal(usesCertExpirationCadence({ from: "completed_at" }), false);
    assert.equal(usesCertExpirationCadence({ days_after_hire: 30, every_n_months: 12 }), false);
    assert.equal(usesCertExpirationCadence(null), false);
  });
});

describe("cert review surface lock", () => {
  it("keeps preview + accept/correction on the existing completion row", () => {
    const page = readFileSync(
      new URL("../routes/dashboard.compliance_.cert-review.$completionId.tsx", import.meta.url),
      "utf8",
    );
    const panel = readFileSync(
      new URL("../components/compliance/cert-review-panel.tsx", import.meta.url),
      "utf8",
    );
    const engine = readFileSync(new URL("./cert-review.ts", import.meta.url), "utf8");
    const staffFile = readFileSync(
      new URL("../components/compliance/staff-file-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /CertReviewPanel/);
    assert.match(engine, /Awaiting review/);
    assert.match(panel, /certReviewStatusLabel/);
    assert.match(panel, /Accept evidence/);
    assert.match(panel, /Request correction/);
    assert.match(panel, /certReviewAcceptBlockReason/);
    assert.match(engine, /Confirm expiration before acceptance/);
    assert.match(staffFile, /cert-review/);
    assert.doesNotMatch(panel, /from\("certificate_reviews"\)/);
  });
});
