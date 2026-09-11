import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { TNS_ORG_ID } from "./escalation.ts";
import { EMPTY_ORG_FACTS, type OrgFacts } from "./applicability.ts";
import { orgWideResolvedScope, resolveScope, type ScopeMemberRow } from "./scope.ts";
import {
  AGENCY_CARD_KEY_BY_OBLIGATION,
  buildPacket,
  clocksFromMyInstances,
  hiddenAgencyCardKeys,
  hiddenClientCardKeys,
  packetItemHref,
  packetSubjectForCatalog,
  type PacketClock,
} from "./packet.ts";
import { allSowCatalogEntries, sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";
import {
  UNKNOWN_STAFF_DUTY_FACTS,
  type StaffDutyFacts,
} from "./duty-applicability.ts";

const VIEWER = "55555555-5555-5555-5555-555555555555";
const STAFF = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const HOUSE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-11T12:00:00.000Z");

const TNS_FACTS: OrgFacts = {
  ...EMPTY_ORG_FACTS,
  servicesOffered: ["HHS", "SLN", "SLH", "SEI", "DSI"],
};

const members: ScopeMemberRow[] = [
  { group_id: HOUSE_A, staff_id: STAFF, is_lead: true },
  { group_id: HOUSE_A, staff_id: VIEWER, is_lead: false },
];

function clock(partial: Partial<PacketClock> & Pick<PacketClock, "obligationKey" | "title">): PacketClock {
  return {
    instanceId: partial.instanceId ?? `inst-${partial.obligationKey}`,
    instanceStatus: partial.instanceStatus ?? "pending",
    dueAt: partial.dueAt ?? "2026-09-20T00:00:00.000Z",
    hasValidEvidence: partial.hasValidEvidence ?? false,
    staffUserId: partial.staffUserId ?? STAFF,
    clientId: partial.clientId ?? null,
    ...partial,
  };
}

describe("packetSubjectForCatalog", () => {
  it("routes hire CPR to staff, housemate to client, zoning to agency", () => {
    const cpr = sowCatalogEntryByKey("cpr_first_aid_initial");
    const house = sowCatalogEntryByKey("housemate_informed_choice");
    const zoning = sowCatalogEntryByKey("zoning_life_safety");
    assert.ok(cpr && house && zoning);
    assert.equal(packetSubjectForCatalog(cpr), "staff");
    assert.equal(packetSubjectForCatalog(house), "client");
    assert.equal(packetSubjectForCatalog(zoning), "agency");
  });

  it("drops retired catalog paths", () => {
    const retired = allSowCatalogEntries().find((e) => e.disposition === "retired");
    assert.ok(retired);
    assert.equal(packetSubjectForCatalog(retired), null);
  });
});

describe("buildPacket", () => {
  it("staff packet includes CPR and hides agency zoning", () => {
    const packet = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      clocks: [
        clock({
          obligationKey: "cpr_first_aid_initial",
          title: "CPR/First Aid Certification — Initial",
          instanceStatus: "overdue",
          dueAt: "2026-09-01T00:00:00.000Z",
        }),
      ],
      now: NOW,
    });
    assert.ok(packet.items.some((i) => i.obligationKey === "cpr_first_aid_initial"));
    assert.equal(
      packet.items.some((i) => i.obligationKey === "zoning_life_safety"),
      false,
    );
    assert.ok(packet.nextAction);
    assert.equal(packet.nextAction.obligationKey, "cpr_first_aid_initial");
    assert.equal(packet.nextAction.urgency, "critical");
    assert.equal(packet.nextAction.href, "/dashboard/my-obligations#packet-inst-cpr_first_aid_initial");
  });

  it("agency packet hides zoning when the OL-site fact is no", () => {
    const packet = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "agency",
      subjectId: null,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: { ...TNS_FACTS, operates_ol_site: false },
      clocks: [],
      now: NOW,
    });
    assert.ok(packet.hiddenKeys.includes("zoning_life_safety"));
    assert.equal(
      packet.items.some((i) => i.obligationKey === "zoning_life_safety"),
      false,
    );
    assert.ok(hiddenAgencyCardKeys(packet).includes(AGENCY_CARD_KEY_BY_OBLIGATION.zoning_life_safety));
  });

  it("agency packet keeps zoning visible while the OL-site fact is unanswered", () => {
    const packet = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "agency",
      subjectId: null,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      clocks: [],
      now: NOW,
    });
    const zoning = packet.items.find((i) => i.obligationKey === "zoning_life_safety");
    assert.ok(zoning);
    assert.equal(zoning.status, "unanswered");
    assert.equal(zoning.applies, true);
  });

  it("TNS housemate stays on the client packet; CHA-only hides Human Rights on agency", () => {
    const client = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "client",
      subjectId: null,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      clocks: [],
      now: NOW,
    });
    assert.equal(client.hiddenKeys.includes("housemate_informed_choice"), false);
    assert.equal(hiddenClientCardKeys(client).includes("housemate"), false);

    const agency = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "agency",
      subjectId: null,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: { ...EMPTY_ORG_FACTS, servicesOffered: ["CHA", "HSQ", "PBA"] },
      clocks: [],
      now: NOW,
    });
    assert.ok(agency.hiddenKeys.includes("human_rights_plan"));
  });

  it("scoped viewer does not see another house's staff packet", () => {
    const scope = resolveScope({
      organizationId: TNS_ORG_ID,
      userId: VIEWER,
      scopeGroupId: HOUSE_A,
      members,
    });
    const hidden = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: OTHER,
      viewerUserId: VIEWER,
      scope,
      facts: TNS_FACTS,
      clocks: [
        clock({
          obligationKey: "cpr_first_aid_initial",
          title: "CPR/First Aid Certification — Initial",
          staffUserId: OTHER,
        }),
      ],
      now: NOW,
    });
    assert.equal(hidden.items.length, 0);
    assert.equal(hidden.nextAction, null);

    const visible = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope,
      facts: TNS_FACTS,
      clocks: [
        clock({
          obligationKey: "cpr_first_aid_initial",
          title: "CPR/First Aid Certification — Initial",
          staffUserId: STAFF,
          dueAt: "2026-09-12T00:00:00.000Z",
        }),
      ],
      now: NOW,
    });
    assert.ok(visible.items.some((i) => i.obligationKey === "cpr_first_aid_initial"));
  });

  it("next action prefers overdue missing over due soon", () => {
    const packet = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      clocks: [
        clock({
          obligationKey: "ce_12h_annual",
          title: "Annual 12-Hour Continuing Education",
          dueAt: "2026-09-14T00:00:00.000Z",
        }),
        clock({
          obligationKey: "cpr_first_aid_initial",
          title: "CPR/First Aid Certification — Initial",
          instanceStatus: "overdue",
          dueAt: "2026-08-01T00:00:00.000Z",
        }),
      ],
      now: NOW,
    });
    assert.equal(packet.nextAction?.obligationKey, "cpr_first_aid_initial");
    assert.equal(packet.nextAction?.urgency, "critical");
  });

  it("Harvey house-manager packet exposes one next action", () => {
    const harvey = "harvey-alisa-house-manager";
    const scope = resolveScope({
      organizationId: TNS_ORG_ID,
      userId: harvey,
      scopeGroupId: HOUSE_A,
      members: [
        { group_id: HOUSE_A, staff_id: harvey, is_lead: true },
        { group_id: HOUSE_A, staff_id: STAFF, is_lead: false },
      ],
    });
    const packet = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: harvey,
      viewerUserId: harvey,
      scope,
      facts: TNS_FACTS,
      clocks: [
        clock({
          obligationKey: "cpr_first_aid_initial",
          title: "CPR/First Aid Certification — Initial",
          instanceStatus: "overdue",
          dueAt: "2026-08-01T00:00:00.000Z",
          staffUserId: harvey,
        }),
        clock({
          obligationKey: "ce_12h_annual",
          title: "Annual 12-Hour Continuing Education",
          dueAt: "2026-09-20T00:00:00.000Z",
          staffUserId: harvey,
        }),
      ],
      now: NOW,
    });
    assert.equal(packet.scoped, true);
    assert.ok(packet.nextAction);
    assert.equal(Array.isArray(packet.nextAction), false);
    assert.equal(packet.nextAction.obligationKey, "cpr_first_aid_initial");
  });

  it("clocksFromMyInstances resolve catalog keys from titles", () => {
    const clocks = clocksFromMyInstances([
      {
        id: "i1",
        status: "pending",
        due_at: "2026-09-20T00:00:00.000Z",
        obligation: { title: "CPR/First Aid Certification — Initial" },
      },
    ]);
    assert.equal(clocks[0]?.obligationKey, "cpr_first_aid_initial");
  });

  it("hrefs stay on the three file surfaces", () => {
    assert.equal(packetItemHref("staff"), "/dashboard/my-obligations");
    assert.equal(packetItemHref("client"), "/dashboard/compliance?tab=client");
    assert.equal(packetItemHref("agency"), "/dashboard/compliance?tab=agency");
  });
});

describe("Step 6 locks", () => {
  it("imports resolveScope and applicability from the expected modules", () => {
    const src = readFileSync(new URL("./packet.ts", import.meta.url), "utf8");
    assert.match(src, /from "\.\/scope\.ts"/);
    assert.match(src, /from "\.\/applicability\.ts"/);
    assert.match(src, /export \{ resolveScope/);
    assert.match(src, /computeObligationApplicability/);
  });

  it("adds no Soft migration and no DROP", () => {
    const fn = readFileSync(new URL("./packet.functions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(fn, /\bDROP\b/);
    const packet = readFileSync(new URL("./packet.ts", import.meta.url), "utf8");
    assert.doesNotMatch(packet, /\bDROP\b/);
  });

  it("file panels and my-obligations consume the packet next action", () => {
    const staff = readFileSync(
      new URL("../../components/compliance/staff-file-panel.tsx", import.meta.url),
      "utf8",
    );
    const client = readFileSync(
      new URL("../../components/compliance/client-file-panel.tsx", import.meta.url),
      "utf8",
    );
    const agency = readFileSync(
      new URL("../../components/compliance/agency-file-panel.tsx", import.meta.url),
      "utf8",
    );
    const mine = readFileSync(
      new URL("../../routes/dashboard.my-obligations.tsx", import.meta.url),
      "utf8",
    );
    assert.match(staff, /PacketNextActionCard/);
    assert.match(client, /PacketNextActionCard/);
    assert.match(agency, /PacketNextActionCard/);
    assert.match(mine, /PacketNextActionCard/);
    assert.equal((staff.match(/<PacketNextActionCard/g) ?? []).length, 1);
    assert.doesNotMatch(staff, /[\u{1F300}-\u{1FAFF}]/u);
    assert.doesNotMatch(client, /[\u{1F300}-\u{1FAFF}]/u);
    assert.doesNotMatch(agency, /[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe("staff duty facts on packets", () => {
  const office: StaffDutyFacts = {
    staffId: STAFF,
    role: "admin",
    assignmentsKnown: true,
    assignedClientIds: [],
    assignedServiceCodes: [],
    transportsKnown: true,
    isTransporter: false,
    abiCaseloadKnown: true,
    hasAbiCaseload: false,
    requiresAbi: false,
    behaviorCaseloadKnown: true,
    hasBehaviorCaseload: false,
    requiresDeescalation: false,
    managerIdKnown: true,
    managerId: null,
  };

  it("hides DSP hire clocks for office staff and keeps unanswered visible", () => {
    const hidden = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      staffDutyFacts: office,
      clocks: [
        clock({
          obligationKey: "cpr_first_aid_initial",
          title: "CPR/First Aid Certification — Initial",
        }),
      ],
      now: NOW,
    });
    assert.ok(hidden.hiddenKeys.includes("cpr_first_aid_initial"));
    assert.equal(
      hidden.items.some((i) => i.obligationKey === "cpr_first_aid_initial"),
      false,
    );

    const unknown = buildPacket({
      organizationId: TNS_ORG_ID,
      subject: "staff",
      subjectId: STAFF,
      viewerUserId: VIEWER,
      scope: orgWideResolvedScope(TNS_ORG_ID, VIEWER),
      facts: TNS_FACTS,
      staffDutyFacts: { staffId: STAFF, ...UNKNOWN_STAFF_DUTY_FACTS },
      clocks: [],
      now: NOW,
    });
    const cpr = unknown.items.find((i) => i.obligationKey === "cpr_first_aid_initial");
    assert.ok(cpr);
    assert.equal(cpr.status, "unanswered");
    assert.equal(cpr.applies, true);
  });
});
