import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CONFLICT_OF_INTEREST_TITLE } from "./obligation-auto-assign.ts";
import { ensureOpenStaffObligationInternal } from "./ensure-staff-obligation.ts";
import { obligationCreatesInstances } from "./sow-obligation-catalog.ts";

function chain(result: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {};
  const passthrough = () => self;
  self.select = passthrough;
  self.eq = passthrough;
  self.in = passthrough;
  self.is = passthrough;
  self.maybeSingle = async () => result;
  self.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return self;
}

describe("ensureOpenStaffObligationInternal", () => {
  it("does not insert an instance for standing catalog titles", async () => {
    const inserts: unknown[] = [];
    const supabase = {
      from(table: string) {
        if (table === "company_obligations") {
          return chain({
            data: [
              {
                id: "ob-1",
                title: CONFLICT_OF_INTEREST_TITLE,
                disposition: "standing",
              },
            ],
            error: null,
          });
        }
        return {
          ...chain({ data: null, error: null }),
          insert: async (row: unknown) => {
            inserts.push(row);
            return { data: null, error: null };
          },
        };
      },
    };
    const result = await ensureOpenStaffObligationInternal(
      supabase,
      "00000000-0000-0000-0000-000000000001",
      [CONFLICT_OF_INTEREST_TITLE],
      { id: "staff-1", full_name: "Ada", role: "employee" },
    );
    assert.equal(result, null);
    assert.equal(inserts.length, 0);
    assert.equal(obligationCreatesInstances({ title: CONFLICT_OF_INTEREST_TITLE }), false);
  });

  it("gates hire/class writers on obligationCreatesInstances", () => {
    const src = readFileSync(new URL("./ensure-staff-obligation.ts", import.meta.url), "utf8");
    assert.match(src, /obligationCreatesInstances\(ob\)/);
  });
});
