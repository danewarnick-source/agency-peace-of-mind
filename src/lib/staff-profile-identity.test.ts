import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  identityDraftFrom,
  loadStaffProfileIdentity,
  memberBelongsToRouteStaff,
  profileBelongsToRouteStaff,
  STAFF_PROFILE_IDENTITY_QUERY_ROOT,
  staffProfileDisplayName,
  staffProfileIdentityQueryKey,
} from "./staff-profile-identity.ts";

const ORG = "org-tns";
const JEFF = "staff-jeff";
const DANE = "staff-dane";

type EqCall = [string, string];

function mockSupabase(opts: {
  member?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  memberError?: { message: string };
  profileError?: { message: string };
}) {
  const calls: Array<{ table: string; eqs: EqCall[] }> = [];
  const from = (table: string) => {
    const eqs: EqCall[] = [];
    const q = {
      select: () => q,
      eq: (col: string, val: string) => {
        eqs.push([col, val]);
        return q;
      },
      maybeSingle: async () => {
        calls.push({ table, eqs });
        if (table === "organization_members") {
          return { data: opts.member ?? null, error: opts.memberError ?? null };
        }
        return { data: opts.profile ?? null, error: opts.profileError ?? null };
      },
    };
    return q;
  };
  return { from, calls };
}

describe("staffProfileIdentityQueryKey", () => {
  it("keys Profile identity load on route staffId so Jeff and Dane never share a cache entry", () => {
    const jeff = staffProfileIdentityQueryKey(ORG, JEFF);
    const dane = staffProfileIdentityQueryKey(ORG, DANE);
    assert.deepEqual(jeff, [STAFF_PROFILE_IDENTITY_QUERY_ROOT, ORG, JEFF]);
    assert.equal(jeff[2], JEFF);
    assert.notDeepEqual(jeff, dane);
    assert.notEqual(jeff[2], DANE);
  });
});

describe("loadStaffProfileIdentity", () => {
  it("filters member and profile by the passed route staffId, never a session user", async () => {
    const sb = mockSupabase({
      member: { id: "mem-jeff", role: "employee", user_id: JEFF, job_title: "DSP" },
      profile: { id: JEFF, full_name: "Jeff", first_name: "Jeff", last_name: "Smith" },
    });
    const bundle = await loadStaffProfileIdentity(sb, { organizationId: ORG, staffId: JEFF });
    assert.equal(bundle?.member.user_id, JEFF);
    assert.equal(bundle?.profile?.id, JEFF);
    assert.equal(bundle?.profile?.full_name, "Jeff");
    assert.deepEqual(sb.calls[0], {
      table: "organization_members",
      eqs: [
        ["organization_id", ORG],
        ["user_id", JEFF],
      ],
    });
    assert.deepEqual(sb.calls[1], {
      table: "profiles",
      eqs: [["id", JEFF]],
    });
    assert.ok(sb.calls.every((c) => !c.eqs.some(([, val]) => val === DANE)));
  });

  it("refuses a member row that is not the route staffId (session leak)", async () => {
    const sb = mockSupabase({
      member: { id: "mem-dane", role: "admin", user_id: DANE, job_title: "Owner" },
      profile: { id: DANE, full_name: "Dane Warnick" },
    });
    const bundle = await loadStaffProfileIdentity(sb, { organizationId: ORG, staffId: JEFF });
    assert.equal(bundle, null);
  });

  it("drops a profile row whose id is not the route staffId", async () => {
    const sb = mockSupabase({
      member: { id: "mem-jeff", role: "employee", user_id: JEFF, job_title: "DSP" },
      profile: { id: DANE, full_name: "Dane Warnick", first_name: "Dane", last_name: "Warnick" },
    });
    const bundle = await loadStaffProfileIdentity(sb, { organizationId: ORG, staffId: JEFF });
    assert.equal(bundle?.member.user_id, JEFF);
    assert.equal(bundle?.profile, null);
    assert.equal(staffProfileDisplayName(bundle?.profile ?? null), "Name not set");
  });

  it("throws when staffId is missing so the loader cannot query the session user", async () => {
    const sb = mockSupabase({ member: { id: "x", role: "admin", user_id: DANE } });
    await assert.rejects(
      () => loadStaffProfileIdentity(sb, { organizationId: ORG, staffId: "  " }),
      /staffId is required/,
    );
    assert.equal(sb.calls.length, 0);
  });
});

describe("route staff identity guards", () => {
  it("accepts only the route staff member and profile", () => {
    assert.equal(memberBelongsToRouteStaff({ id: "m", role: "admin", user_id: DANE }, JEFF), false);
    assert.equal(
      memberBelongsToRouteStaff({ id: "m", role: "employee", user_id: JEFF }, JEFF),
      true,
    );
    assert.equal(
      profileBelongsToRouteStaff(
        {
          id: DANE,
          full_name: "Dane",
          email: null,
          username: null,
          phone: null,
          hire_date: null,
          start_date: null,
        },
        JEFF,
      ),
      false,
    );
    assert.equal(
      profileBelongsToRouteStaff(
        {
          id: JEFF,
          full_name: "Jeff",
          email: null,
          username: null,
          phone: null,
          hire_date: null,
          start_date: null,
        },
        JEFF,
      ),
      true,
    );
  });

  it("drafts identity from the given member, not an implied session role", () => {
    const draft = identityDraftFrom(
      {
        id: JEFF,
        full_name: "Jeff Smith",
        first_name: "Jeff",
        last_name: "Smith",
        email: "jeff@tns.test",
        username: null,
        phone: null,
        hire_date: null,
        start_date: null,
      },
      { id: "mem-jeff", role: "employee", user_id: JEFF, job_title: "DSP" },
    );
    assert.equal(draft.first_name, "Jeff");
    assert.equal(draft.role, "employee");
    assert.notEqual(draft.role, "admin");
  });
});

describe("employee Profile identity source lock", () => {
  it("route and panel load identity via the staffId-keyed helper", () => {
    const route = readFileSync(
      new URL("../routes/dashboard.employees.$staffId.tsx", import.meta.url),
      "utf8",
    );
    const panel = readFileSync(
      new URL("../components/employees/staff-profile-panel.tsx", import.meta.url),
      "utf8",
    );
    const identityUi = readFileSync(
      new URL("../components/employees/staff-profile-identity.tsx", import.meta.url),
      "utf8",
    );
    assert.match(route, /staffProfileIdentityQueryKey\(orgId, staffId\)/);
    assert.match(route, /loadStaffProfileIdentity/);
    assert.match(route, /Route\.useParams\(\)/);
    assert.match(route, /data-testid="staff-profile-heading"/);
    assert.match(route, /key=\{staffId\}/);
    assert.doesNotMatch(route, /useAuth/);
    assert.match(panel, /staffProfileIdentityQueryKey\(orgId, staffId\)/);
    assert.match(panel, /loadStaffProfileIdentity/);
    assert.doesNotMatch(panel, /useAuth/);
    assert.match(identityUi, /data-testid="staff-profile-identity"/);
    assert.match(identityUi, /data-staff-id=\{staffId\}/);
  });
});
