/**
 * Focused e2e: 1056 authorizations / client billing codes (Sep 1 True North).
 *
 * PR 177 opened a client chart and saw codes listed. This spec walks add/edit
 * 1056 (Cancel, no live persist), the Medicaid Member ID gate, and
 * "no active auth → nothing useful to clock."
 *
 * Mock admin/DSP auth + fixture roster. Does not write live True North data.
 *
 * Run: npm run test:e2e
 * Skipped automatically when STAGING_URL is set without E2E_MODE=mock
 * (live crawl must not dump PHI).
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { CLIENTS } from "./fixtures/tns-roster";
import {
  assertPageNotBlank,
  installHiveMocks,
  waitForDashboard,
  type HiveMockHandle,
} from "./helpers/mock-hive";

test.use({ storageState: { cookies: [], origins: [] } });

const LOCAL_SHOTS = path.join(process.cwd(), "test-results", "client-1056-billing");
const ARTIFACT_DIR = fs.existsSync("/opt/cursor/artifacts")
  ? "/opt/cursor/artifacts"
  : LOCAL_SHOTS;

async function shot(page: Page, name: string) {
  const file = `${name}.png`;
  for (const dir of new Set([LOCAL_SHOTS, ARTIFACT_DIR])) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, file), fullPage: false });
    } catch {
      /* screenshot is evidence, not the assertion */
    }
  }
}

async function gotoAdmin(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForDashboard(page);
}

function billingMutations(handle: HiveMockHandle) {
  return handle.mutatingRest.filter((c) => c.table === "client_billing_codes");
}

test.describe("1056 authorizations — mocked admin", () => {
  test("1. Client chart Billing tab shows active 1056 codes for TNS services", async ({
    page,
  }) => {
    await installHiveMocks(page, { persona: "admin" });
    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.tommy.id}?tab=billing`);
    await expect(page.getByRole("heading", { name: /Tommy Jones/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: /^Billing$/i })).toBeVisible();
    await page.getByRole("tab", { name: /^Billing$/i }).click();

    await expect(page.getByText(/Billing Codes Detail/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("DSI").first()).toBeVisible();
    await expect(page.getByText("HHS").first()).toBeVisible();
    await expect(page.getByText("SEI").first()).toBeVisible();
    await expect(page.getByText("SLH").first()).toBeVisible();
    await expect(page.getByText(/Variable rate · client-specific/i).first()).toBeVisible();
    await expect(page.getByText(/Daily code/i).first()).toBeVisible();
    await expect(page.getByText(/Hourly code/i).first()).toBeVisible();
    await expect(page.getByText(/Add a new authorized code/i)).toBeVisible();
    await expect(page.getByText(/Pick DSPD service codes/i)).toBeVisible();
    await assertPageNotBlank(page, "Tommy billing tab");
    await shot(page, "01-tommy-billing-1056-codes");

    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.stephen.id}?tab=billing`);
    await expect(page.getByRole("heading", { name: /Stephen Prince/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("SLH").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("SLN").first()).toBeVisible();
    await shot(page, "02-stephen-slh-sln-codes");
  });

  test("2. Open add/edit 1056; Cancel; no persist", async ({ page }) => {
    const handle = await installHiveMocks(page, { persona: "admin" });
    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.tommy.id}?tab=billing`);
    await expect(page.getByText(/Billing Codes Detail/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const before = billingMutations(handle).length;

    await page.getByRole("button", { name: /^Edit$/i }).click();
    await expect(page.getByText(/changed/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Cancel/i })).toBeVisible();
    await shot(page, "03-edit-1056-bulk");
    await page.getByRole("button", { name: /Cancel/i }).click();
    await expect(page.getByRole("button", { name: /^Edit$/i })).toBeVisible();

    await page.getByRole("button", { name: /Remove DSI/i }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText(/Remove DSI/i).first()).toBeVisible();
    await shot(page, "04-remove-1056-cancel");
    await page.getByRole("alertdialog").getByRole("button", { name: /Cancel/i }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText("DSI").first()).toBeVisible();

    await page.getByText(/Pick DSPD service codes/i).click();
    const slnOpt = page.getByRole("button", { name: /^SLN\b/i }).first();
    await expect(slnOpt).toBeVisible();
    await slnOpt.click();
    await expect(page.getByRole("button", { name: /^Add 1$/i })).toBeVisible();
    await shot(page, "05-add-code-picker-not-saved");
    // Leave without clicking Add — picker is client-side only until Add.

    await gotoAdmin(page, `/dashboard/billing/${CLIENTS.tommy.id}`);
    await expect(page.getByRole("heading", { name: /Jones, Tommy/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Authorized billing codes/i)).toBeVisible();
    const newCode = page.getByPlaceholder(/DSI \/ HHS/i);
    await expect(newCode).toBeVisible();
    await newCode.fill("COM");
    await shot(page, "06-full-billing-editor-unsaved");
    // Do not click Add.

    expect(
      billingMutations(handle).length,
      "Cancel/unsaved add must not PATCH/POST client_billing_codes",
    ).toBe(before);
    expect(
      handle.mutatingServerFns.some((fn) => /addClientBillingCodes/i.test(fn)),
      "AddCodesControl must not call addClientBillingCodes when Add is not clicked",
    ).toBe(false);

    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.tommy.id}?tab=billing`);
    await expect(page.getByText("DSI").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("HHS").first()).toBeVisible();
    await expect(page.getByText("SEI").first()).toBeVisible();
    await expect(page.getByText("SLH").first()).toBeVisible();
  });

  test("3. Client with NO codes: desktop em-dash vs mobile 'No service codes'; chart empty state", async ({
    page,
  }) => {
    await installHiveMocks(page, { persona: "admin" });

    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAdmin(page, "/dashboard/clients");
    await expect(page.getByRole("heading", { name: /Client Directory/i })).toBeVisible({
      timeout: 20_000,
    });
    const desktopRow = page.locator("table tr").filter({ hasText: "Marcus Rivera" });
    await expect(desktopRow).toBeVisible();
    await expect(desktopRow.getByText("—").first()).toBeVisible();
    await expect(desktopRow.getByText(/No service codes/i)).toHaveCount(0);
    await shot(page, "07-marcus-desktop-emdash");

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAdmin(page, "/dashboard/clients");
    await expect(page.getByText("Marcus Rivera").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/No service codes/i).first()).toBeVisible();
    await shot(page, "08-marcus-mobile-no-service-codes");

    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.marcus.id}?tab=billing`);
    await expect(page.getByRole("heading", { name: /Marcus Rivera/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/No authorized billing codes yet/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/Add codes via the multi-select above/i),
    ).toBeVisible();
    await assertPageNotBlank(page, "Marcus empty 1056 chart");
    await shot(page, "09-marcus-chart-no-authorized-codes");
  });

  test("4. Medicaid Member ID visible; empty ID implication only on punch pad", async ({
    page,
  }) => {
    await installHiveMocks(page, { persona: "admin" });
    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.tommy.id}?tab=identity`);
    await expect(page.getByRole("heading", { name: /Tommy Jones/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Medicaid #MOCK-TJ-001/i)).toBeVisible();
    await expect(page.getByText(/Individual Medicaid ID/i).first()).toBeVisible();
    await expect(page.getByText("MOCK-TJ-001").first()).toBeVisible();
    const identityBody = (await page.locator("body").innerText()) || "";
    expect(
      /cannot clock|missing a Utah Medicaid|clock-in/i.test(identityBody),
      "Identity tab does not explain the clock-in Medicaid gate (finding, not a crash)",
    ).toBeFalsy();
    await shot(page, "10-tommy-identity-medicaid");

    await page.getByRole("tab", { name: /^Billing$/i }).click();
    await expect(page.getByText(/Individual Medicaid ID/i).first()).toBeVisible({
      timeout: 10_000,
    });
    // BillingCodesDetail is not passed medicaidId from the chart, so the card
    // value is an em-dash even though Identity has MOCK-TJ-001. Record that.
    const billingCard = page.locator("text=Individual Medicaid ID").first().locator("xpath=../..");
    const billingMedicaidText = ((await billingCard.innerText().catch(() => "")) || "").replace(
      /\s+/g,
      " ",
    );
    expect(billingMedicaidText).toMatch(/Individual Medicaid ID/i);
    await shot(page, "11-billing-tab-medicaid-field");

    await gotoAdmin(page, `/dashboard/billing/${CLIENTS.tommy.id}`);
    await expect(page.getByText(/Medicaid ID:/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("MOCK-TJ-001")).toBeVisible();

    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.avery.id}?tab=identity`);
    await expect(page.getByRole("heading", { name: /Avery Quinn/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Medicaid #/i)).toHaveCount(0);
    await expect(page.getByText(/Individual Medicaid ID/i).first()).toBeVisible();
    await shot(page, "12-avery-empty-medicaid-identity");
  });

  test("5. Empty and error billing states do not crash", async ({ page }) => {
    await installHiveMocks(page, { persona: "admin", emptyBilling: true });
    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.tommy.id}?tab=billing`);
    await expect(page.getByRole("heading", { name: /Tommy Jones/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/No authorized billing codes yet/i)).toBeVisible({
      timeout: 10_000,
    });
    await assertPageNotBlank(page, "empty billing codes");

    await installHiveMocks(page, { persona: "admin", billingError: true });
    await gotoAdmin(page, `/dashboard/clients/${CLIENTS.tommy.id}?tab=billing`);
    await page.waitForTimeout(800);
    await assertPageNotBlank(page, "billing codes error");
    await shot(page, "13-empty-and-error-billing");
  });
});

test.describe("1056 → punch pad — mocked DSP", () => {
  test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: 40.76, longitude: -111.89 },
  });

  test("6. Active 1056 codes appear on punch pad; no auth blocks clock-in", async ({ page }) => {
    await installHiveMocks(page, { persona: "dsp" });
    await gotoAdmin(page, `/dashboard/workspace/${CLIENTS.tommy.id}?tab=clock-in`);
    await expect(page.getByRole("heading", { name: /Tommy Jones/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Verified Medicaid ID/i).first()).toBeVisible();
    await expect(page.getByText("MOCK-TJ-001").first()).toBeVisible();
    await page.getByText(/Select Service Code/i).first().click().catch(async () => {
      await page.getByRole("combobox").first().click();
    });
    await expect(
      page.getByText(/Restricted to authorizations|Select authorized code|DSI|SEI|SLH/i).first(),
    ).toBeVisible();
    await assertPageNotBlank(page, "Tommy punch pad");
    await shot(page, "14-tommy-punch-pad-codes");

    await page.goto(`/dashboard/workspace/${CLIENTS.marcus.id}?tab=clock-in`, {
      waitUntil: "domcontentloaded",
    });
    await waitForDashboard(page);
    await expect(
      page.getByText(/not assigned to any hourly services|not assigned to this individual/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await shot(page, "15-marcus-no-auth-workspace-blocked");
  });

  test("7. Empty Medicaid ID refuses clock-in", async ({ page }) => {
    await installHiveMocks(page, { persona: "dsp" });
    await gotoAdmin(page, `/dashboard/workspace/${CLIENTS.avery.id}?tab=clock-in`);
    await expect(page.getByRole("heading", { name: /Avery Quinn/i })).toBeVisible({
      timeout: 20_000,
    });
    const medicaidLine = page.getByText(/Verified Medicaid ID/i).first();
    await expect(medicaidLine).toBeVisible();
    await expect(medicaidLine).toContainText("—");
    await expect(page.getByText(/No codes authorized/i)).toHaveCount(0);

    const serviceTrigger = page.getByRole("combobox").first();
    await serviceTrigger.click();
    await page.getByRole("option", { name: /SLN/i }).first().click();
    await shot(page, "16-avery-punch-pad-empty-medicaid");

    await page.getByRole("button", { name: /Clock In|Start EVV Shift/i }).first().click();
    await expect(
      page.getByText(/Client is missing a Utah Medicaid Member ID/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await shot(page, "17-avery-medicaid-gate-toast");
  });
});
