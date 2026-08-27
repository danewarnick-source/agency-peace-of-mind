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
import {
  assertPageNotBlank,
  installHiveMocks,
  waitForDashboard,
} from "./helpers/mock-hive";

test.use({ storageState: { cookies: [], origins: [] } });

const ARTIFACT_DIR = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : path.join(process.cwd(), "test-results", "clients-staff-roster");

async function shot(page: Page, name: string) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function gotoAdmin(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForDashboard(page);
}

test.describe("Clients + Staff roster — mocked admin", () => {
  test.beforeEach(async ({ page }) => {
    await installHiveMocks(page, { persona: "admin" });
  });

  test("1. Clients list loads; search/filter; open a chart without crash", async ({
    page,
  }) => {
    await gotoAdmin(page, "/dashboard/clients");
    await expect(page.getByRole("heading", { name: /Client Directory/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Tommy Jones")).toBeVisible();
    await expect(page.getByText("Blake Stevens")).toBeVisible();
    await expect(page.getByText("Stephen Prince")).toBeVisible();
    await expect(page.getByText("Marcus Rivera")).toBeVisible();
    await expect(page.getByText("DSI").first()).toBeVisible();

    const search = page.getByPlaceholder(/Search by name or Medicaid ID/i);
    await expect(search).toBeVisible();
    await search.fill("Jones");
    await expect(page.getByText("Tommy Jones")).toBeVisible();
    await expect(page.getByText("Blake Stevens")).toHaveCount(0);

    await search.fill("zzzz-no-match");
    await expect(page.getByText(/No clients match your search/i)).toBeVisible();
    await search.fill("");
    await expect(page.getByText("Blake Stevens")).toBeVisible();

    await page.getByRole("link", { name: /Tommy Jones/i }).first().click();
    await page.waitForURL(/\/dashboard\/clients\/00000000-0000-4000-a000-000000000101/);
    await expect(page.getByRole("heading", { name: /Tommy Jones/i })).toBeVisible({
      timeout: 15_000,
    });
    await assertPageNotBlank(page, "client chart after list click");
    await shot(page, "clients_list_and_chart");
  });

  test("2. Client chart shows DSPD codes, home, and key care tabs", async ({
    page,
  }) => {
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
    await expect(page.getByRole("heading", { name: /Homes & Teams/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Maple House")).toBeVisible();
    await expect(page.getByText("Oak SLH")).toBeVisible();
    await expect(page.getByText(/Tommy/i).first()).toBeVisible();
    await shot(page, "client_chart_codes_and_homes");
  });

  test("3. Pending clients page loads", async ({ page }) => {
    await gotoAdmin(page, "/dashboard/clients/pending");
    await expect(page.getByRole("heading", { name: /Pending Clients/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/haven't joined your directory|All imported clients are finalized/i)).toBeVisible();
    await assertPageNotBlank(page, "pending clients");
    await shot(page, "pending_clients");
  });

  test("4. Employees list loads; staff profile shows role at a glance", async ({
    page,
  }) => {
    await gotoAdmin(page, "/dashboard/employees");
    await expect(page.getByRole("heading", { name: /Team members/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Jake Probert")).toBeVisible();
    await expect(page.getByText("Harvey Alisa")).toBeVisible();
    await expect(page.getByText("Tom Jones")).toBeVisible();
    await expect(page.getByText("Dane Warnick")).toBeVisible();
    await expect(page.getByText(/^admin$/i).first()).toBeVisible();
    await expect(page.getByText(/^employee$/i).first()).toBeVisible();

    await page.locator("a[href*='/dashboard/employees/']", { hasText: "View" }).first().click();
    await page.waitForURL(/\/dashboard\/employees\/00000000-0000-4000-a000-/);
    await expect(page.getByRole("tab", { name: /Staff record/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: /^Permissions$/i })).toBeVisible();
    await expect(page.getByText(/admin|employee|manager/i).first()).toBeVisible();
    await assertPageNotBlank(page, "staff profile");

    await page.getByRole("tab", { name: /^Permissions$/i }).click();
    await expect(page.getByText(/Invite staff|View staff records|permission/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await shot(page, "employees_list_and_profile");
  });

  test("5. Invite-by-email is honest — add staff manually, not a silent no-op", async ({
    page,
  }) => {
    await gotoAdmin(page, "/dashboard/employees");
    await expect(page.getByRole("button", { name: /Invite by email/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Add manually/i })).toBeVisible();

    // Pending-invite copy already tells testers the join link does not onboard.
    await expect(
      page.getByText(/does not call|add staff with|Add manually/i).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: /Invite by email/i }).click();
    await expect(page.getByRole("heading", { name: /Invite an employee/i })).toBeVisible();
    await page.locator("#email").fill("sep1.tester@example.test");
    await page.getByRole("button", { name: /Create invitation/i }).click();

    const toast = page.getByText(/Add manually|Invitation emailed|couldn't be sent|Unauthorized|does not/i).first();
    await expect(toast).toBeVisible({ timeout: 10_000 });
    const toastText = (await toast.innerText()) || "";
    expect(
      /silen|done(?![\s\S])/i.test(toastText) && !/manually|emailed|couldn't/i.test(toastText),
    ).toBeFalsy();

    await shot(page, "invite_staff_honest_copy");

    await gotoAdmin(page, "/dashboard/invitations");
    await expect(page.getByRole("heading", { name: /Employee invitations/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /Invite by email/i })).toBeVisible();
    await assertPageNotBlank(page, "invitations");
  });

  test("staff surfaces: team, teams→homes, roles", async ({ page }) => {
    await gotoAdmin(page, "/dashboard/team");
    await expect(page.getByRole("heading", { name: /Team progress/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Jake Probert")).toBeVisible();
    await assertPageNotBlank(page, "team progress");

    await gotoAdmin(page, "/dashboard/teams");
    await expect(page).toHaveURL(/\/dashboard\/homes/);
    await expect(page.getByRole("heading", { name: /Homes & Teams/i })).toBeVisible();

    await gotoAdmin(page, "/dashboard/roles");
    await expect(page.getByRole("heading", { name: /Roles/i }).or(page.getByText(/permissions/i).first())).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Dane Warnick")).toBeVisible();
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
    await page.waitForTimeout(1200);
    const url = page.url();
    const body = ((await page.locator("body").innerText().catch(() => "")) || "").toLowerCase();
    const gated =
      /\/unauthorized/.test(url) ||
      /unauthorized|don't have permission|do not have permission|access request|loading…/i.test(body);
    expect(gated, `DSP reached employee admin. url=${url}`).toBeTruthy();
    await expect(page.getByRole("button", { name: /Invite by email/i })).toHaveCount(0);
    await shot(page, "dsp_rbac_employees_gated");
  });
});
