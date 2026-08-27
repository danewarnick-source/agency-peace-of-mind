import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirror of assertLaunchpadPassed in src/lib/scheduling/shifts.functions.ts.
 * The live function lives next to createServerFn and cannot be imported from
 * node:test without TanStack Start. The production copy still uses
 * has_passed_launchpad with no tester bypass.
 */
async function assertLaunchpadPassed(supabase: any, staffId: string): Promise<void> {
  void staffId;
  const { data, error } = await supabase
    .from("profiles")
    .select("has_passed_launchpad")
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.has_passed_launchpad) {
    throw new Error(
      "This staff member has not completed Launchpad and cannot be assigned as a sole worker.",
    );
  }
}

function mockSb(row: { has_passed_launchpad: boolean | null } | null, error: Error | null = null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: row, error }),
              };
            },
          };
        },
      };
    },
  };
}

describe("assertLaunchpadPassed", () => {
  it("blocks clock-in / sole-worker assign when has_passed_launchpad is false", async () => {
    await assert.rejects(
      () => assertLaunchpadPassed(mockSb({ has_passed_launchpad: false }), "staff-1"),
      /has not completed Launchpad/,
    );
  });

  it("blocks when the flag is null", async () => {
    await assert.rejects(
      () => assertLaunchpadPassed(mockSb({ has_passed_launchpad: null }), "staff-1"),
      /has not completed Launchpad/,
    );
  });

  it("blocks when the profile row is missing", async () => {
    await assert.rejects(
      () => assertLaunchpadPassed(mockSb(null), "staff-1"),
      /has not completed Launchpad/,
    );
  });

  it("allows assign when the tester override is the real flag set true (SQL), not a code bypass", async () => {
    await assertLaunchpadPassed(mockSb({ has_passed_launchpad: true }), "jake-probert");
  });

  it("does not skip the gate for a tester-shaped email identity — only the profile flag matters", async () => {
    await assert.rejects(
      () =>
        assertLaunchpadPassed(mockSb({ has_passed_launchpad: false }), "jake.probert@example.test"),
      /has not completed Launchpad/,
    );
  });
});
