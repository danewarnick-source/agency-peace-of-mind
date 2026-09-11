import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  complianceRedirectSearchFromAgencyDocuments,
  complianceSearchForAgencySubTab,
  complianceSearchForFileTab,
  parseComplianceSearch,
  resolveAgencyFileSubTab,
  resolveComplianceFileTab,
} from "./compliance-nav.ts";

describe("Compliance search aliases", () => {
  it("defaults to Staff file and accepts personnel aliases", () => {
    assert.equal(resolveComplianceFileTab(undefined), "staff");
    assert.equal(resolveComplianceFileTab("personnel"), "staff");
    assert.equal(resolveComplianceFileTab("personnel-file"), "staff");
    assert.equal(resolveComplianceFileTab("staff-file"), "staff");
    assert.equal(resolveComplianceFileTab("staff"), "staff");
  });

  it("maps client and agency aliases, including Company policies", () => {
    assert.equal(resolveComplianceFileTab("client-file"), "client");
    assert.equal(resolveComplianceFileTab("agency-documents"), "agency");
    assert.equal(resolveComplianceFileTab("company-policies"), "agency");
    assert.equal(resolveAgencyFileSubTab("company-policies"), "company-policies");
    assert.equal(resolveAgencyFileSubTab("policies"), "company-policies");
    assert.equal(resolveAgencyFileSubTab("agency"), "documents");
    assert.deepEqual(parseComplianceSearch({ tab: "personnel" }), { tab: "personnel" });
    assert.deepEqual(complianceSearchForFileTab("client"), { tab: "client" });
    assert.deepEqual(complianceSearchForAgencySubTab("company-policies"), {
      tab: "company-policies",
    });
    assert.deepEqual(complianceRedirectSearchFromAgencyDocuments("company-policies"), {
      tab: "company-policies",
    });
    assert.equal(resolveComplianceFileTab("sow-index"), "agency");
    assert.equal(resolveAgencyFileSubTab("sow-index"), "contract-index");
    assert.equal(resolveAgencyFileSubTab("contract-index"), "contract-index");
    assert.deepEqual(complianceSearchForAgencySubTab("contract-index"), {
      tab: "contract-index",
    });
  });
});

describe("Compliance nav lock", () => {
  it("replaces the three Admin file items with Compliance and leaves State Audit", () => {
    const nav = readFileSync(new URL("../routes/dashboard.tsx", import.meta.url), "utf8");
    assert.match(nav, /to: "\/dashboard\/compliance", label: "Compliance"/);
    assert.match(nav, /item\.to === "\/dashboard\/compliance"/);
    assert.match(nav, /to: "\/dashboard\/state-audit"/);
    assert.match(nav, /label: "State Audit"/);
    assert.doesNotMatch(nav, /to: "\/dashboard\/personnel-file"/);
    assert.doesNotMatch(nav, /to: "\/dashboard\/client-file"/);
    assert.doesNotMatch(nav, /to: "\/dashboard\/agency-documents"/);
    assert.match(nav, /to: "\/dashboard\/my-obligations", label: "Staff file"/);
  });

  it("hosts Staff / Client / Agency file tabs on the Compliance shell", () => {
    const shell = readFileSync(new URL("../routes/dashboard.compliance.tsx", import.meta.url), "utf8");
    assert.match(shell, /createFileRoute\("\/dashboard\/compliance"\)/);
    assert.match(shell, /Staff file/);
    assert.match(shell, /Client file/);
    assert.match(shell, /Agency file/);
    assert.match(shell, /StaffFilePanel/);
    assert.match(shell, /ClientFilePanel/);
    assert.match(shell, /AgencyFilePanel/);
    assert.doesNotMatch(shell, /State Audit/);
  });

  it("keeps Company policies under Agency file", () => {
    const panel = readFileSync(
      new URL("../components/compliance/agency-file-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /Company policies/);
    assert.match(panel, /CompanyPoliciesTab/);
    assert.match(panel, /Agency Contract/);
    assert.match(panel, /SowIndexPanel/);
  });

  it("does not rename the client profile Compliance tab", () => {
    const profile = readFileSync(
      new URL("../routes/dashboard.clients.$clientId.tsx", import.meta.url),
      "utf8",
    );
    assert.match(profile, /<TabsTrigger value="compliance">Compliance<\/TabsTrigger>/);
  });
});
