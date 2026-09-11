import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ADMIN_PRIMARY_NAV_LABELS,
  RETIRED_COMPLIANCE_REDIRECTS,
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
  it("keeps twelve primary admin nav items and drops retired parallel labels", () => {
    assert.equal(ADMIN_PRIMARY_NAV_LABELS.length, 12);
    const nav = readFileSync(new URL("../routes/dashboard.tsx", import.meta.url), "utf8");
    const start = nav.indexOf("const ADMIN_NAV: NavItem[] = [");
    const end = nav.indexOf("];", start);
    assert.ok(start >= 0 && end > start, "ADMIN_NAV block");
    const block = nav.slice(start, end);
    const labels = [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(labels, [...ADMIN_PRIMARY_NAV_LABELS]);
    assert.match(nav, /to: "\/dashboard\/compliance", label: "Compliance"/);
    assert.match(nav, /item\.to === "\/dashboard\/compliance"/);
    assert.doesNotMatch(block, /state-audit/);
    assert.doesNotMatch(block, /label: "Reports"/);
    assert.doesNotMatch(block, /command-center/);
    assert.doesNotMatch(block, /compliance-desk/);
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
    assert.match(shell, /to="\/dashboard\/state-audit"/);
    assert.match(shell, /to="\/dashboard\/reports"/);
    assert.doesNotMatch(shell, /RequirePermission/);
  });

  it("lists retired route redirects including Command Center → Home", () => {
    const froms = RETIRED_COMPLIANCE_REDIRECTS.map((r) => r.from);
    assert.ok(froms.includes("/dashboard/command-center"));
    assert.ok(froms.includes("/dashboard/external-compliance"));
    const cc = readFileSync(new URL("../routes/dashboard.command-center.tsx", import.meta.url), "utf8");
    assert.match(cc, /throw redirect/);
    assert.match(cc, /to: "\/dashboard"/);
    assert.doesNotMatch(cc, /id="obligations"/);
    const ext = readFileSync(new URL("../routes/dashboard.external-compliance.tsx", import.meta.url), "utf8");
    assert.match(ext, /to: "\/dashboard\/hub\/knowledge"/);
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
