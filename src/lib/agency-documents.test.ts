import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AGENCY_DOC_CARD_KEYS,
  AGENCY_DOC_CARD_TITLE,
  AGENCY_DOC_ENCODED_KEYS,
  AGENCY_DOC_FLAG_KEYS,
  AGENCY_DOC_OBLIGATION_TITLES,
  COMPANY_POLICY_TEMPLATES,
  agencyDocApplies,
  agencyDocKeyForTitle,
  agencyDocStatusLabel,
  buildAgencyDocCards,
  isAgencyDocumentTitle,
  isCompanyPolicyObligation,
  missingAgencyDocCsv,
  tallyAgencyDocCards,
  type AgencyDocInstance,
} from "./agency-documents.ts";

const now = new Date("2026-09-10T12:00:00.000Z");

function row(
  title: string,
  status: AgencyDocInstance["instanceStatus"],
  dueAt: string,
  extra?: Partial<AgencyDocInstance>,
): AgencyDocInstance {
  return {
    title,
    instanceStatus: status,
    dueAt,
    obligationId: "ob-1",
    instanceId: "inst-1",
    ...extra,
  };
}

describe("Agency documents lock", () => {
  it("keeps the Dane flag + encoded card set and only three statuses", () => {
    assert.deepEqual(Array.from(AGENCY_DOC_FLAG_KEYS), [
      "insurance",
      "commerce",
      "medicaid_standing",
      "ol_licenses",
      "host_home",
      "pps_foster",
      "facility_safety",
      "coc_posted",
      "enrollment",
      "baa",
      "board",
    ]);
    assert.deepEqual(Array.from(AGENCY_DOC_ENCODED_KEYS), [
      "coi",
      "continuity",
      "personnel_operating",
      "hrc_hrp",
      "no_gifts",
      "discharge",
      "iqm",
      "large_loan",
      "incident_process",
      "hipaa_npp",
    ]);
    assert.equal(AGENCY_DOC_CARD_KEYS.length, 21);
    assert.equal(AGENCY_DOC_CARD_TITLE.insurance, "Insurance");
    assert.equal(AGENCY_DOC_CARD_TITLE.personnel_operating, "Personnel+operating pack");
    assert.equal(AGENCY_DOC_CARD_TITLE.hrc_hrp, "HRC charter+HRP setup");
    assert.equal(agencyDocStatusLabel("on_file"), "On file");
    assert.equal(agencyDocStatusLabel("due_soon"), "Due soon");
    assert.equal(agencyDocStatusLabel("missing"), "Missing");
  });

  it("maps existing SOW titles onto the locked cards", () => {
    assert.equal(
      agencyDocKeyForTitle("General, Professional, and Automobile Liability Insurance"),
      "insurance",
    );
    assert.equal(agencyDocKeyForTitle("Staff Conflict of Interest Process"), "coi");
    assert.equal(agencyDocKeyForTitle("Human Rights Plan"), "hrc_hrp");
    assert.equal(isAgencyDocumentTitle("30-Day New Hire Orientation Training"), false);
    assert.equal(isAgencyDocumentTitle("Cell phone use"), false);
  });

  it("gates Host Home, PPS, and OL cards on awarded codes", () => {
    assert.equal(agencyDocApplies("host_home", ["HHS"]), true);
    assert.equal(agencyDocApplies("host_home", ["SEI"]), false);
    assert.equal(agencyDocApplies("pps_foster", ["PPS"]), true);
    assert.equal(agencyDocApplies("ol_licenses", ["RHS"]), true);
    assert.equal(agencyDocApplies("ol_licenses", ["DSI"]), true);
    assert.equal(agencyDocApplies("ol_licenses", ["SEI"]), false);
    assert.equal(agencyDocApplies("insurance", ["SEI"]), true);
  });

  it("excludes company policies from the DSPD pack", () => {
    assert.equal(isCompanyPolicyObligation({ agency_policy_id: "p1" }), true);
    assert.equal(isCompanyPolicyObligation({ source: "provider" }), true);
    assert.equal(
      isCompanyPolicyObligation({
        source: "sow",
        source_policy_section: "SOW §1.8(4) topic P — contractor’s own policies",
      }),
      true,
    );
    assert.equal(
      isCompanyPolicyObligation({ source: "sow", source_policy_section: "CST 46" }),
      false,
    );
  });

  it("builds one card per duty and renews the same card", () => {
    const cards = buildAgencyDocCards(
      [
        row(
          "General, Professional, and Automobile Liability Insurance",
          "completed",
          "2026-07-01T00:00:00.000Z",
          { instanceUploadPath: "ins.pdf", instanceUploadFilename: "ins.pdf" },
        ),
        row(
          "General, Professional, and Automobile Liability Insurance",
          "pending",
          "2027-07-01T00:00:00.000Z",
        ),
        row("Staff Conflict of Interest Process", "pending", "2026-09-14T00:00:00.000Z"),
        row("Personnel Policies and Job Descriptions", "completed", "2026-01-01T00:00:00.000Z", {
          instanceUploadPath: "personnel.pdf",
        }),
        row("Operating Policies and Procedures", "pending", ""),
      ],
      ["HHS", "SLN"],
      now,
    );
    const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
    assert.equal(byKey.insurance?.status, "on_file");
    assert.equal(byKey.insurance?.title, "Insurance");
    assert.equal(byKey.coi?.status, "due_soon");
    assert.equal(byKey.personnel_operating?.status, "missing");
    assert.equal(byKey.host_home?.status, "missing");
    assert.equal(cards.some((c) => c.key === "ol_licenses"), false);
    assert.equal(cards.some((c) => c.key === "pps_foster"), false);
    assert.equal(byKey.commerce?.coreSeedNeeded, true);
    assert.equal(byKey.commerce?.status, "missing");
  });

  it("requires both personnel and operating files for that pack card", () => {
    const cards = buildAgencyDocCards(
      [
        row("Personnel Policies and Job Descriptions", "completed", "2026-01-01T00:00:00.000Z", {
          instanceUploadPath: "a.pdf",
        }),
        row("Operating Policies and Procedures", "completed", "2026-01-01T00:00:00.000Z", {
          instanceUploadPath: "b.pdf",
        }),
      ],
      ["SEI"],
      now,
    );
    assert.equal(cards.find((c) => c.key === "personnel_operating")?.status, "on_file");
  });

  it("treats day or residential evidence as enough for the matching OL group", () => {
    const dayOnly = buildAgencyDocCards(
      [
        row("OL Day Treatment License — 4+ Persons", "completed", "2026-07-01T00:00:00.000Z", {
          instanceUploadPath: "day.pdf",
        }),
      ],
      ["DSI"],
      now,
    );
    assert.equal(dayOnly.find((c) => c.key === "ol_licenses")?.status, "on_file");

    const rhsMissing = buildAgencyDocCards(
      [
        row("OL Day Treatment License — 4+ Persons", "completed", "2026-07-01T00:00:00.000Z", {
          instanceUploadPath: "day.pdf",
        }),
      ],
      ["DSI", "RHS"],
      now,
    );
    assert.equal(rhsMissing.find((c) => c.key === "ol_licenses")?.status, "missing");
  });

  it("keeps company policy templates off the DSPD card list", () => {
    assert.deepEqual(
      COMPANY_POLICY_TEMPLATES.map((t) => t.title),
      ["Cell phone use", "Vehicle policy", "Visitor rules"],
    );
    for (const t of COMPANY_POLICY_TEMPLATES) {
      assert.equal(isAgencyDocumentTitle(t.title), false);
    }
  });

  it("exports missing rows without inventing a fourth audit product", () => {
    const cards = buildAgencyDocCards([], ["SEI"], now);
    const counts = tallyAgencyDocCards(cards);
    assert.ok(counts.missing > 0);
    const csv = missingAgencyDocCsv(cards);
    assert.match(csv, /Insurance/);
    assert.match(csv, /Core seed needed/);
    assert.doesNotMatch(csv, /Have/);
    assert.doesNotMatch(csv, /Proofs/);
    assert.doesNotMatch(csv, /Certs & forms/);
  });
});

describe("Agency file surface lock", () => {
  it("folds Agency file under Admin Compliance and keeps Company policies", () => {
    const nav = readFileSync(new URL("../routes/dashboard.tsx", import.meta.url), "utf8");
    assert.match(nav, /to: "\/dashboard\/compliance", label: "Compliance"/);
    assert.match(nav, /to: "\/dashboard\/state-audit"/);
    assert.match(nav, /label: "State Audit"/);
    assert.doesNotMatch(nav, /to: "\/dashboard\/agency-documents", label: "/);
    assert.doesNotMatch(nav, /label: "Agency documents"/);
    assert.doesNotMatch(nav, /to: "\/dashboard\/company-obligations", label: "Compliance"/);
    const route = readFileSync(
      new URL("../routes/dashboard.agency-documents.tsx", import.meta.url),
      "utf8",
    );
    assert.match(route, /createFileRoute\("\/dashboard\/agency-documents"\)/);
    assert.match(route, /redirect/);
    assert.match(route, /\/dashboard\/compliance/);
    const panel = readFileSync(
      new URL("../components/compliance/agency-file-panel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(panel, /Agency file/);
    assert.match(panel, /Company policies/);
    assert.doesNotMatch(panel, /ObligationPackGrid/);
    assert.doesNotMatch(panel, /EVV/);
    assert.doesNotMatch(panel, /eMAR/);
  });

  it("replaces the company-obligations product path with a redirect", () => {
    const src = readFileSync(
      new URL("../routes/dashboard.company-obligations.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /redirect/);
    assert.match(src, /\/dashboard\/compliance/);
    assert.doesNotMatch(src, /ObligationPackGrid/);
    assert.doesNotMatch(src, /title: "Compliance/);
  });

  it("does not mix company policies into the encoded pack titles", () => {
    const titles = Object.values(AGENCY_DOC_OBLIGATION_TITLES).flat();
    assert.ok(!titles.includes("Cell phone use"));
    assert.ok(!titles.some((t) => /contractor.s own policies/i.test(t)));
  });
});
