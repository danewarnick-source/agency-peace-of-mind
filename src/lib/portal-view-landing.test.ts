import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  companyAdminSwitchAccessibleName,
  nextPortalViewAfterLogin,
  resolvePostLoginLanding,
  STAFF_VIEW_ACCESSIBLE_NAME,
} from "./portal-view-landing.ts";

describe("resolvePostLoginLanding — do not force hive_exec", () => {
  it("executive + stored view admin does not overwrite portal-view to hive_exec", () => {
    const stored = "admin" as const;
    const landing = resolvePostLoginLanding({
      isExecutive: true,
      storedView: stored,
      isCompanyAdmin: true,
    });
    assert.equal(landing.persistView, null, "must not write portal-view on login");
    assert.equal(landing.path, "/dashboard");
    assert.equal(
      nextPortalViewAfterLogin({ isExecutive: true, storedView: stored, isCompanyAdmin: true }),
      "admin",
    );
    assert.notEqual(
      nextPortalViewAfterLogin({ isExecutive: true, storedView: stored, isCompanyAdmin: true }),
      "hive_exec",
    );
  });

  it("honors stored staff and staff_mobile without overwriting", () => {
    for (const stored of ["staff", "staff_mobile"] as const) {
      const landing = resolvePostLoginLanding({
        isExecutive: true,
        storedView: stored,
        isCompanyAdmin: true,
      });
      assert.equal(landing.persistView, null);
      assert.equal(landing.path, "/dashboard");
      assert.equal(
        nextPortalViewAfterLogin({ isExecutive: true, storedView: stored, isCompanyAdmin: true }),
        stored,
      );
    }
  });

  it("honors last Command Center choice", () => {
    const landing = resolvePostLoginLanding({
      isExecutive: true,
      storedView: "hive_exec",
      isCompanyAdmin: true,
    });
    assert.equal(landing.path, "/dashboard/hive-exec");
    assert.equal(landing.persistView, null);
    assert.equal(
      nextPortalViewAfterLogin({
        isExecutive: true,
        storedView: "hive_exec",
        isCompanyAdmin: true,
      }),
      "hive_exec",
    );
  });

  it("exec + org admin with no stored view defaults to Admin, not Command Center", () => {
    const landing = resolvePostLoginLanding({
      isExecutive: true,
      storedView: null,
      isCompanyAdmin: true,
    });
    assert.equal(landing.path, "/dashboard");
    assert.equal(landing.persistView, "admin");
    assert.equal(
      nextPortalViewAfterLogin({ isExecutive: true, storedView: null, isCompanyAdmin: true }),
      "admin",
    );
  });

  it("platform-only executive with no stored view defaults to hive_exec", () => {
    const landing = resolvePostLoginLanding({
      isExecutive: true,
      storedView: null,
      isCompanyAdmin: false,
    });
    assert.equal(landing.path, "/dashboard/hive-exec");
    assert.equal(landing.persistView, "hive_exec");
  });

  it("non-executive is never sent to hive-exec", () => {
    const landing = resolvePostLoginLanding({
      isExecutive: false,
      storedView: null,
      isCompanyAdmin: true,
    });
    assert.equal(landing.path, "/dashboard");
    assert.equal(landing.persistView, null);
  });
});

describe("hive-exec Open company / Admin View control", () => {
  const OPEN_COMPANY_OR_ADMIN = /Open (company|.+) Admin/i;

  it("accessible name matches Open company / Admin View", () => {
    assert.match(companyAdminSwitchAccessibleName("True North Supports"), OPEN_COMPANY_OR_ADMIN);
    assert.match(companyAdminSwitchAccessibleName(null), OPEN_COMPANY_OR_ADMIN);
    assert.equal(
      companyAdminSwitchAccessibleName("True North Supports"),
      "Open True North Supports Admin",
    );
    assert.equal(companyAdminSwitchAccessibleName(null), "Open company Admin");
    assert.equal(STAFF_VIEW_ACCESSIBLE_NAME, "Staff view");
  });

  it("OpenCompanyViews uses those accessible names", () => {
    const path = fileURLToPath(
      new URL("../components/hive-exec/open-company-views.tsx", import.meta.url),
    );
    const src = readFileSync(path, "utf8");
    assert.match(src, /companyAdminSwitchAccessibleName/);
    assert.match(src, /STAFF_VIEW_ACCESSIBLE_NAME/);
    assert.match(src, /setView\(view\)/);
    assert.match(src, /go\("admin"\)/);
    assert.match(src, /go\("staff"\)/);
  });

  it("dashboard hamburger stays on hive-exec (not gated off)", () => {
    const path = fileURLToPath(new URL("../routes/dashboard.tsx", import.meta.url));
    const src = readFileSync(path, "utf8");
    assert.match(src, /aria-label="Open menu"/);
    assert.doesNotMatch(
      src,
      /!isHiveExecView[\s\S]{0,240}aria-label="Open menu"/,
      "Menu must not be wrapped in !isHiveExecView",
    );
  });

  it("login no longer blindly writes hive_exec for every executive", () => {
    const path = fileURLToPath(new URL("../routes/login.tsx", import.meta.url));
    const src = readFileSync(path, "utf8");
    assert.match(src, /resolvePostLoginLanding/);
    assert.doesNotMatch(src, /localStorage\.setItem\("portal-view", "hive_exec"\)/);
  });
});
