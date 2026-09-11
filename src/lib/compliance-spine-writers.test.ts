import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ORPHAN_OBLIGATION_CREATE_GONE } from "./compliance-spine.ts";

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("Compliance spine — parallel writers killed", () => {
  it("bell / deadlines fetch is skipMutations and does not generate", () => {
    const src = read("./company-obligations.functions.ts");
    const fnStart = src.indexOf("export const listDeadlineObligationInstances");
    assert.ok(fnStart >= 0, "listDeadlineObligationInstances");
    const fn = src.slice(fnStart, src.indexOf("export const getCompanyObligation", fnStart));
    assert.match(fn, /skipMutations:\s*true/);
    assert.match(fn, /generateMissing:\s*false/);
    assert.doesNotMatch(
      fn,
      /bootstrapVisibleObligationInstancesInternal\(supabase, data\.organizationId\)/,
    );
  });

  it("skipMutations also skips standing seeds and instance minting", () => {
    const src = read("./company-obligations.functions.ts");
    assert.match(src, /const skipMutations = opts\?\.skipMutations === true/);
    assert.match(src, /if \(skipMutations \|\| opts\?\.generateMissing === false\)/);
  });

  it("intake does not write nectar_compliance_rules", () => {
    const punch = read("./nectar-compliance.functions.ts");
    const proposeStart = punch.indexOf("export const proposeComplianceRule");
    const propose = punch.slice(
      proposeStart,
      punch.indexOf("export const updateComplianceRule"),
    );
    assert.match(propose, /return \{ id: "" \}/);
    assert.doesNotMatch(propose, /\.from\(["']nectar_compliance_rules/);

    const draftStart = punch.indexOf("export const draftStaffPrerequisiteRules");
    const draft = punch.slice(draftStart);
    assert.match(draft, /inserted: 0/);
    assert.doesNotMatch(draft, /\.insert\(\{/);
  });

  it("nectar_compliance_* punch-pad / shift / incident writers no-op", () => {
    const punch = read("./nectar-compliance.functions.ts");
    const raiseStart = punch.indexOf("export const raiseComplianceFlag");
    const raise = punch.slice(raiseStart, punch.indexOf("export const resolveComplianceFlag"));
    assert.match(raise, /return null;/);
    assert.doesNotMatch(raise, /\.from\(["']nectar_compliance_flags/);

    const shift = read("./scheduling/shift-commit.ts");
    const raiseFn = shift.slice(
      shift.indexOf("async function raiseAndMaybeResolve"),
      shift.indexOf("export type GateOpts"),
    );
    assert.match(raiseFn, /return;/);
    assert.doesNotMatch(raiseFn, /\.from\(["']nectar_compliance_flags/);

    const incident = read("./compliance-resolution.ts");
    assert.match(incident, /export async function resolveComplianceRequirement/);
    assert.match(incident, /export async function createIncidentInstances/);
    assert.doesNotMatch(incident, /\.from\(["']nectar_compliance_instances/);
    assert.doesNotMatch(incident, /\.insert\(/);
  });

  it("orphan create APIs throw 410 and do not insert", () => {
    assert.match(ORPHAN_OBLIGATION_CREATE_GONE, /410 Gone/);
    const obligations = read("./company-obligations.functions.ts");
    const createStart = obligations.indexOf("export const createCompanyObligation");
    const create = obligations.slice(
      createStart,
      obligations.indexOf("export const updateCompanyObligation"),
    );
    assert.match(create, /ORPHAN_OBLIGATION_CREATE_GONE/);
    assert.doesNotMatch(create, /\.from\(["']company_obligations["']\)\s*\n\s*\.insert/);

    const packs = read("./obligation-packs.functions.ts");
    const packCreate = packs.slice(
      packs.indexOf("export const createObligationPack"),
      packs.indexOf("export const assignObligationPack"),
    );
    const addItem = packs.slice(
      packs.indexOf("export const addPackItem"),
      packs.indexOf("export const attachExistingToPack"),
    );
    assert.match(packCreate, /ORPHAN_OBLIGATION_CREATE_GONE/);
    assert.match(addItem, /ORPHAN_OBLIGATION_CREATE_GONE/);
    assert.doesNotMatch(packCreate, /\.insert\(/);
    assert.doesNotMatch(addItem, /\.insert\(/);
  });

  it("does not drop nectar or obligation tables", () => {
    const note = read("../../docs/SQL_HANDOFF.md");
    assert.match(note, /Do not DROP tables\. Do not run Soft SQL for this change/);
    assert.doesNotMatch(note.slice(0, 1800), /DROP TABLE/);
    const step7 = read(
      "../../supabase/migrations/20260911170000_nectar_requirement_catalog_relation.sql",
    );
    assert.doesNotMatch(step7, /DROP TABLE/);
    assert.match(step7, /catalog_relation/);
  });
});
