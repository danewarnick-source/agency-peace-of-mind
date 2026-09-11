/**
 * Focused e2e: Hive CLIENTS + STAFF ROSTER (admin view, Sep 1 True North).
 *
 * Mock admin auth + fixture roster. Does not create/delete live clients or staff.
 *
 * Run: npm run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { CLIENTS, STAFF } from "./fixtures/tns-roster";
import { assertPageNotBlank, installHiveMocks, waitForDashboard } from "./helpers/mock-hive";

test.use({ storageState: { cookies: [], origins: [] } });

const ARTIFACT_DIR = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(process.cwd(), "test-results", "clients-staff-roster");

async function shot(page: Page, name: string) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `${name}.png`),
    fullPage: false,
  });
}

async function gotoAdmin(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForDashboard(page);
}

/** Names render in both the mobile card list (hidden on desktop) and the table. */
function rosterName(page: Page, name: string) {
  return page.locator("table").getByText(name, { exact: true });
}

test.describe("Clients + Staff roster — mocked admin", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { persona: "admin" });
  });

  test("1. Clients list loads; search/filter; open a chart without crash", async ({ page }) => {
    await gotoAdmin(page, "/dashboard/clients");
    await expect(page.getByRole("heading", { name: /Client Directory/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(rosterName(page, "Tommy Jones")).toBeVisible();
    await expect(rosterName(page, "Blake Stevens")).toBeVisible();
    await expect(rosterName(page, "Stephen Prince")).toBeVisible();
    await expect(rosterName(page, "Marcus Rivera")).toBeVisible();
    await expect(page.locator("table").getByText("DSI").first()).toBeVisible();

    const search = page.getByPlaceholder(/Search by name or Medicaid ID/i);
    await expect(search).toBeVisible();
    await search.fill("Jones");
    await expect(rosterName(page, "Tommy Jones")).toBeVisible();
    await expect(page.getByText("Blake Stevens", { exact: true })).toHaveCount(0);

    await search.fill("zzzz-no-match");
    await expect(page.getByText(/No clients match your search/i).first()).toBeVisible();
    await search.fill("");
    await expect(rosterName(page, "Blake Stevens")).toBeVisible();

    await page
      .getByRole("link", { name: /Tommy Jones/i })
      .first()
      .click();
    await page.waitForURL(/\/dashboard\/clients\/00000000-0000-4000-a000-000000000101/);
    await expect(page.getByRole("heading", { name: /Tommy Jones/i })).toBeVisible({
      timeout: 15_000,
    });
    await assertPageNotBlank(page, "client chart after list click");
    await shot(page, "clients_list_and_chart");
  });

  test("2. Client chart shows DSPD codes, home, and key care tabs", async ({ page }) => {
    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.tommy.id}`);
    await expect(page.getByRole("heading", { name: /Tommy Jones/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Host home/i).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Identity$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Care plan/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Billing$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Files$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Operations/i })).toBeVisible();

    await page.getByRole("tab", { name: /^Billing$/i }).click();
    await expect(page.getByText("DSI").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("HHS").first()).toBeVisible();
    await expect(page.getByText("SEI").first()).toBeVisible();
    await expect(page.getByText("SLH").first()).toBeVisible();

    await page.getByRole("tab", { name: /Care plan/i }).click();
    await expect(page.getByRole("tab", { name: /^Goals$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Target Behaviors/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Medications/i })).toBeVisible();

    await gotoAdmin(page, "/dashboard/homes");
    await expect(page.getByRole("heading", { name: /Homes & Teams/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Maple House").first()).toBeVisible();
    await expect(page.getByText("Oak SLH").first()).toBeVisible();
    await expect(page.getByText(/Tommy/i).first()).toBeVisible();
    await shot(page, "client_chart_codes_and_homes");
  });

  test("3. Pending clients page loads", async ({ page }) => {
    await gotoAdmin(page, "/dashboard/clients/pending");
    await expect(page.getByRole("heading", { name: /Pending Clients/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/haven't joined your directory|All imported clients are finalized/i).first(),
    ).toBeVisible();
    await assertPageNotBlank(page, "pending clients");
    await shot(page, "pending_clients");
  });

  test("4. Employees list loads; staff profile shows role at a glance", async ({ page }) => {
    await gotoAdmin(page, "/dashboard/employees");
    await expect(page.getByRole("heading", { name: /Team members/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /^Active$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Inactive$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload roster/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Smart Import/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Import CSV/i })).toHaveCount(0);
    await expect(rosterName(page, "Jake Probert")).toBeVisible();
    await page.getByRole("button", { name: /^Inactive$/i }).click();
    await expect(page.getByText(/No deactivated employees/i).first()).toBeVisible();
    await expect(rosterName(page, "Jake Probert")).toHaveCount(0);
    await page.getByRole("button", { name: /^Active$/i }).click();
    await expect(rosterName(page, "Jake Probert")).toBeVisible();
    await expect(rosterName(page, "Harvey Alisa")).toBeVisible();
    await expect(rosterName(page, "Tom Jones")).toBeVisible();
    await expect(rosterName(page, "Dane Warnick")).toBeVisible();
    await expect(
      page
        .locator("table")
        .getByText(/^admin$/i)
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator("table")
        .getByText(/^employee$/i)
        .first(),
    ).toBeVisible();
    await expect(page.locator("table").getByText(/^Last Login$/i)).toBeVisible();
    await expect(page.locator("table").getByRole("button", { name: /Caseload/i }).first()).toBeVisible();
    await expect(page.locator("table").getByRole("button", { name: /More actions/i }).first()).toBeVisible();
    await expect(page.locator("table").getByRole("link", { name: /Staff file/i })).toHaveCount(0);
    await expect(page.locator("table").getByRole("link", { name: /^View$/i })).toHaveCount(0);
    await expect(page.locator("table").getByText("Aug 27, 2026").first()).toBeVisible();

    await rosterName(page, "Jake Probert").click();
    await page.waitForURL(new RegExp(`/dashboard/employees/${STAFF.jake.id}`));
    await expect(page).toHaveURL(new RegExp(`/dashboard/employees/${STAFF.jake.id}`));
    await expect(page.getByTestId("staff-profile-page")).toHaveAttribute(
      "data-staff-id",
      STAFF.jake.id,
    );
    await expect(page.getByTestId("staff-profile-heading")).toHaveText(/Jake Probert/);
    await expect(page.getByTestId("staff-profile-identity")).toHaveAttribute(
      "data-staff-id",
      STAFF.jake.id,
    );
    await expect(page.getByTestId("staff-profile-identity")).toContainText("Jake");
    await expect(page.getByTestId("staff-profile-identity")).toContainText("Probert");
    await expect(page.getByTestId("staff-profile-identity")).not.toContainText("Dane");
    await expect(page.getByTestId("staff-profile-identity")).not.toContainText("Owner");
    await expect(page.getByTestId("staff-profile-heading")).not.toHaveText(/Dane|Roster Admin/);
    await expect(page.getByRole("tab", { name: /^Profile$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: /Staff file/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Activity$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Permissions$/i })).toHaveCount(0);
    await expect(
      page.getByText(/admin|employee|manager|Owner|Staff|Supervisor/i).first(),
    ).toBeVisible();
    await assertPageNotBlank(page, "staff profile");

    await expect(page.getByRole("button", { name: /Edit profile/i })).toBeVisible();
    await expect(
      page
        .getByText(/people & files|Staff phone permissions|Invite staff|View staff records/i)
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, "employees_list_and_profile");
  });

  test("5. Add employee wizard — full file first, then invite or temp password", async ({
    page,
  }) => {
    await gotoAdmin(page, "/dashboard/employees");
    await expect(page.getByRole("button", { name: /^Add employee$/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Invite by email/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add manually/i })).toHaveCount(0);

    await page.getByRole("button", { name: /^Add employee$/i }).click();
    await expect(page.getByRole("heading", { name: /Add employee/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add another employee/i })).toBeVisible();
    await expect(page.getByLabel(/End date/i)).toHaveCount(0);
    await expect(page.getByText(/Assigned training tracks/i)).toHaveCount(0);
    await expect(page.getByText(/Behavior-related training/i)).toHaveCount(0);
    await page.locator("#first_name").fill("Sep");
    await page.locator("#last_name").fill("Tester");
    await page.locator("#email").fill("sep1.tester@example.test");
    await page.locator("#phone").fill("555-010-0199");
    await page.locator("#hire_date").fill("2026-07-01");
    await page.getByRole("button", { name: /Create employee/i }).click();

    await expect(page.getByRole("heading", { name: /How should they sign in/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Send invite email/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Show temporary password/i })).toBeVisible();

    await page.getByRole("button", { name: /Send invite email/i }).click();
    const toast = page.locator("[data-sonner-toast]").filter({
      hasText: /Invite emailed|couldn't be sent|Invitation created|Unauthorized/i,
    });
    await expect(toast.first()).toBeVisible({ timeout: 10_000 });

    await shot(page, "add_employee_wizard_access");

    await gotoAdmin(page, "/dashboard/invitations");
    await expect(page.getByRole("heading", { name: /Employee invitations/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: /^Add employee$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Invite by email/i })).toHaveCount(0);
    await assertPageNotBlank(page, "invitations");
  });

  test("staff surfaces: team, teams→homes, roles", async ({ page }) => {
    await gotoAdmin(page, "/dashboard/team");
    await expect(page.getByRole("heading", { name: /Team progress/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(rosterName(page, "Jake Probert")).toBeVisible();
    await assertPageNotBlank(page, "team progress");

    await gotoAdmin(page, "/dashboard/teams");
    await expect(page).toHaveURL(/\/dashboard\/homes/);
    await expect(page.getByRole("heading", { name: /Homes & Teams/i }).first()).toBeVisible();

    await gotoAdmin(page, "/dashboard/roles");
    await expect(page.getByRole("heading", { name: /Roles & permissions/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(rosterName(page, "Dane Warnick")).toBeVisible();
    await assertPageNotBlank(page, "roles");
    await shot(page, "staff_team_homes_roles");
  });

  test("7. Empty and error states do not blank the page", async ({ page }) => {
    // Reinstall with empty roster after the default beforeEach — next nav uses it.
    await installHiveMocks(page, { persona: "admin", emptyClients: true });
    await gotoAdmin(page, "/dashboard/clients");
    await expect(page.getByText(/No clients yet|Add your first client/i)).toBeVisible({
      timeout: 20_000,
    });
    await assertPageNotBlank(page, "empty clients");

    await installHiveMocks(page, { persona: "admin", clientsError: true });
    await gotoAdmin(page, "/dashboard/clients");
    await page.waitForTimeout(800);
    await assertPageNotBlank(page, "clients error");
    const body = (await page.locator("body").innerText()) || "";
    expect(
      /something went wrong|no clients|mocked clients read failure|Client Directory/i.test(body),
    ).toBeTruthy();

    await installHiveMocks(page, { persona: "admin" });
    await gotoAdmin(page, "/dashboard/clients/00000000-0000-0000-0000-ffffffffffff");
    await page.waitForTimeout(800);
    await assertPageNotBlank(page, "missing client chart");
    await shot(page, "empty_and_error_states");
  });
});

test.describe("RBAC — DSP / employee cannot open employee admin", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { persona: "dsp" });
  });

  test("6. DSP is gated off the employees admin roster", async ({ page }) => {
    await gotoAdmin(page, "/dashboard/employees");
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Access denied/i })).toBeVisible();
    await expect(page.getByText(/View staff records/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Invite by email/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Add employee$/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Team members/i })).toHaveCount(0);
    await shot(page, "dsp_rbac_employees_gated");
  });
});
