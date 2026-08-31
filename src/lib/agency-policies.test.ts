import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENCY_POLICY_MAX_BYTES,
  audienceLabel,
  isAllowedPolicyFile,
  policyHasContent,
  policyMediaKind,
  staffLooksLikeDriver,
  staffMatchesPolicyAudience,
} from "./agency-policies.ts";

describe("agency policy audience", () => {
  it("labels everyone, drivers, and a job code", () => {
    assert.equal(audienceLabel("everyone"), "Everyone");
    assert.equal(audienceLabel("drivers"), "Drivers");
    assert.equal(audienceLabel("job_code", "SLN"), "Job code SLN");
  });

  it("everyone matches any staff", () => {
    assert.equal(
      staffMatchesPolicyAudience({ kind: "everyone" }, { staffTypeKeys: [] }),
      true,
    );
  });

  it("drivers match transporter, MTP, or driver job wording", () => {
    assert.equal(
      staffLooksLikeDriver({ staffTypeKeys: ["DSP"], isTransporter: true }),
      true,
    );
    assert.equal(
      staffLooksLikeDriver({ staffTypeKeys: [], assignedServiceCodes: ["MTP"] }),
      true,
    );
    assert.equal(
      staffLooksLikeDriver({ staffTypeKeys: ["driver"], assignedServiceCodes: [] }),
      true,
    );
    assert.equal(
      staffLooksLikeDriver({ staffTypeKeys: ["DSP"], assignedServiceCodes: ["SLN"] }),
      false,
    );
  });

  it("job code matches staff type or assigned service code", () => {
    assert.equal(
      staffMatchesPolicyAudience(
        { kind: "job_code", jobCode: "sln" },
        { staffTypeKeys: ["SLN"] },
      ),
      true,
    );
    assert.equal(
      staffMatchesPolicyAudience(
        { kind: "job_code", jobCode: "HHS" },
        { staffTypeKeys: ["DSP"], assignedServiceCodes: ["HHS"] },
      ),
      true,
    );
    assert.equal(
      staffMatchesPolicyAudience(
        { kind: "job_code", jobCode: "SEI" },
        { staffTypeKeys: ["DSP"], assignedServiceCodes: ["SLN"] },
      ),
      false,
    );
  });
});

describe("agency policy files", () => {
  it("caps uploads at 100 MB", () => {
    assert.equal(AGENCY_POLICY_MAX_BYTES, 100 * 1024 * 1024);
    assert.match(
      isAllowedPolicyFile({ name: "handbook.pdf", type: "application/pdf", size: AGENCY_POLICY_MAX_BYTES + 1 }) ?? "",
      /100 MB/i,
    );
    assert.equal(
      isAllowedPolicyFile({ name: "handbook.pdf", type: "application/pdf", size: 1_000 }),
      null,
    );
  });

  it("requires a file or pasted text", () => {
    assert.equal(policyHasContent({ bodyText: "  Welcome  " }), true);
    assert.equal(policyHasContent({ fileName: "policy.pdf" }), true);
    assert.equal(policyHasContent({ bodyText: "  ", fileName: "" }), false);
  });

  it("classifies video, image, and PDF for the staff viewer", () => {
    assert.equal(policyMediaKind("video/mp4", "clip.mp4"), "video");
    assert.equal(policyMediaKind("image/png", "slide.png"), "image");
    assert.equal(policyMediaKind("application/pdf", "book.pdf"), "pdf");
    assert.equal(policyMediaKind(null, "deck.pptx"), "other");
  });
});
