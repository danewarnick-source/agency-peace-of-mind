/**
 * Admin-view EVV & Timesheet Control (`/dashboard/compliance-desk`).
 *
 * Runs against a local Vite harness with mocked org/auth/timesheets so we never
 * write True North production data. Approve / Save resolution / live DHHS
 * export confirm are asserted as present, not submitted.
 *
 * Real product gate: RequirePermission perm="approve_timesheets".
 * Admin vs staff: Portal View toggle (Admin View vs Staff View / Compass).
 * This spec renders as admin (approve_timesheets), not staff Compass.
 */
import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(__dirname, "artifacts");

async function shot(page: Page, name: string) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({
    path: path.join(ARTIFACTS, `${name}.png`),
    fullPage: true,
  });
}

async function openDesk(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("portal-view", "admin");
      window.localStorage.setItem("hive.activeOrgId", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/e2e/compliance-desk", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("e2e-compliance-desk-harness")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "EVV & Timesheet Control" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("compliance-tab-pending")).toBeVisible({ timeout: 15_000 });
  // Org membership has resolved when the Utah export CTA is enabled.
  await expect(
    page.getByRole("button", { name: /Export Utah DHHS EVV CSV/i }).first(),
  ).toBeEnabled({ timeout: 20_000 });
}

async function openTab(page: Page, id: string) {
  await page.keyboard.press("Escape").catch(() => {});
  const tab = page.getByTestId(`compliance-tab-${id}`);
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await expect(tab).toHaveClass(/bg-accent/, { timeout: 10_000 });
}

test.describe("EVV & Timesheet Control — admin harness", () => {
  test("renders as admin (not Staff Compass) with approve_timesheets context", async ({
    page,
  }) => {
    await openDesk(page);
    await expect(page.getByTestId("e2e-admin-context")).toContainText("Admin View");
    await expect(page.getByTestId("e2e-admin-context")).toContainText("approve_timesheets");
    await expect(page.getByText("Staff Compass is out of scope")).toBeVisible();
    // Staff Compass punch pad chrome is not on this admin page.
    await expect(page.getByText("My Caseload")).toHaveCount(0);
    await shot(page, "01-pending-review");
  });

  test("header CTAs: Utah CSV dialog opens (no submit), Master Ledger present, Company obligations navigates", async ({
    page,
  }) => {
    await openDesk(page);

    await expect(page.getByRole("button", { name: /Export Utah DHHS EVV CSV/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Export Master Agency Ledger CSV/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Company obligations/i })).toBeVisible();

    await page.getByRole("button", { name: /Export Utah DHHS EVV CSV/i }).first().click();
    const utahDialog = page.getByRole("dialog").filter({ hasText: /Export Utah DHHS EVV CSV/i });
    await expect(utahDialog).toBeVisible();
    await shot(page, "02-utah-export-dialog");
    // Do NOT confirm a DHHS submission.
    await utahDialog.getByRole("button", { name: /close|cancel/i }).first().click().catch(async () => {
      await page.keyboard.press("Escape");
    });
    await expect(utahDialog).toHaveCount(0);

    await page.getByRole("button", { name: /Company obligations/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/company-obligations/, { timeout: 15_000 });
  });

  test("Pending Review: EVV vs non-EVV tables, expand, GPS map, geofence reason, approve present, edit dialog (no save)", async ({
    page,
  }) => {
    await openDesk(page);

    await expect(page.getByRole("heading", { name: "Pending EVV Shifts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Internal (non-EVV) pending" })).toBeVisible();

    await expect(page.getByText("Maya Chen").first()).toBeVisible();
    await expect(page.getByText("Sam Ortiz").first()).toBeVisible();
    await expect(page.getByText("SLH").first()).toBeVisible();
    await expect(page.getByText("SEI").first()).toBeVisible();

    // Badge states on pending ledger
    await expect(page.getByText("MATCH").first()).toBeVisible();
    await expect(page.getByText("NEEDS RECONCILIATION").first()).toBeVisible();
    await expect(page.getByText("GPS BYPASSED — ADDRESS USED")).toBeVisible();

    // Expand first pending EVV row (click the caregiver cell / row)
    const evvRow = page.locator("tr[role='button']").filter({ hasText: "Maya Chen" }).first();
    await evvRow.click();
    await expect(page.getByText("Shift Note")).toBeVisible();
    await expect(page.getByText(/grocery shopping|money skills/i).first()).toBeVisible();
    await expect(page.getByText("Staff Attestation")).toBeVisible();
    await expect(page.getByText("Goals Targeted")).toBeVisible();
    await expect(page.getByText(/Practice counting change/i)).toBeVisible();

    // NECTAR flag on the needs-recon row
    const flagRow = page.locator("tr[role='button']").filter({ hasText: "COM" }).first();
    await flagRow.click();
    await expect(page.getByText(/NECTAR flag|NECTAR Review/i).first()).toBeVisible();
    await shot(page, "03-pending-row-expanded");

    // View GPS map dialog — close, do not persist
    await page.getByRole("button", { name: /^View$/i }).first().click();
    const gpsDialog = page.getByRole("dialog").filter({ hasText: /GPS Map Match/i });
    await expect(gpsDialog).toBeVisible();
    await expect(gpsDialog.getByText("Clock-In", { exact: true })).toBeVisible();
    await gpsDialog.getByRole("button", { name: "Close", exact: true }).first().click();

    // Geofence reason dialog
    await page.getByText("NEEDS RECONCILIATION").first().click();
    const reasonDialog = page.getByRole("dialog").filter({ hasText: /Geofence Variance Justification/i });
    await expect(reasonDialog).toBeVisible();
    await expect(reasonDialog.getByText(/library/i)).toBeVisible();
    await reasonDialog.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(reasonDialog).toHaveCount(0);

    // Approve is present — do not click (would write if this were live)
    await expect(page.getByRole("button", { name: "Approve" }).first()).toBeVisible();

    // Edit-shift dialog — open, do not save
    await page.keyboard.press("Escape").catch(() => {});
    await page.locator("tr[role='button']").first().getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog").filter({ hasText: /Administrative Shift Override/i });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByText(/immutable audit trail/i)).toBeVisible();
    await expect(editDialog.getByRole("button", { name: /Save & Log Audit Entry/i })).toBeVisible();
    await shot(page, "04-edit-shift-dialog");
    await editDialog.getByRole("button", { name: /Cancel/i }).click();
    await expect(editDialog).toHaveCount(0);
  });

  test("Needs Review: correction / incident / ≥16h rows; reject requires a note; approve present but not clicked", async ({
    page,
  }) => {
    await openDesk(page);
    await openTab(page, "needs-review");

    await expect(page.getByRole("heading", { name: "Needs Review" })).toBeVisible();
    await expect(page.getByText(/Caregiver corrections/i)).toBeVisible();
    await expect(page.getByText("Correction submitted")).toBeVisible();
    await expect(page.getByText("Incident flagged")).toBeVisible();
    await expect(page.getByText(/Forgot to clock out/i)).toBeVisible();
    await expect(page.getByText(/Overnight coverage/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve correction/i }).first()).toBeVisible();
    await shot(page, "05-needs-review");

    await page.getByRole("button", { name: /^Reject$/i }).first().click();
    await expect(page.getByText(/Reviewer note \(required for reject\)/i)).toBeVisible();
    const returnBtn = page.getByRole("button", { name: /Return to caregiver/i }).first();
    await expect(returnBtn).toBeDisabled();
    await page.getByPlaceholder(/Why is this being returned/i).fill("Times do not match the schedule.");
    await expect(returnBtn).toBeEnabled();
    // Do not click Return — that would write review_status=rejected.
    await page.getByRole("button", { name: /^Cancel$/i }).click();
  });

  test("EVV Reconciliation: status filter, Resolve dialog attestation rules (no save)", async ({
    page,
  }) => {
    await openDesk(page);
    await openTab(page, "reconcile");

    await expect(page.getByText("EVV Reconciliation Queue")).toBeVisible();
    await shot(page, "06-reconciliation-pending");

    // Default filter is Pending
    await expect(page.getByRole("button", { name: /^Resolve$/i }).first()).toBeVisible();

    await page.getByRole("combobox").filter({ hasText: /Pending/i }).click();
    await page.getByRole("option", { name: "All", exact: true }).click();
    await expect(page.getByText("RECONCILED").first()).toBeVisible();
    await expect(page.getByText("CORRECTED").first()).toBeVisible();
    await expect(page.getByText("FLAGGED").first()).toBeVisible();
    await expect(page.getByText("NEEDS RECONCILIATION").first()).toBeVisible();

    await page.getByRole("button", { name: /^Resolve$/i }).first().click();
    const resolve = page.getByRole("dialog").filter({ hasText: /Resolve EVV Location Exception/i });
    await expect(resolve).toBeVisible();
    await expect(resolve.getByText(/Attestation \(required\)/i)).toBeVisible();
    await expect(resolve.getByText(/I confirm the above attestation is true and accurate/i)).toBeVisible();
    await expect(resolve.getByText(/Your full name/i)).toBeVisible();
    await expect(resolve.getByText(/Your title/i)).toBeVisible();
    // Attestation checkbox must start unchecked — never auto-tick Medicaid fraud attestation.
    const attest = resolve.locator('input[type="checkbox"]');
    await expect(attest).not.toBeChecked();

    await resolve.getByRole("button", { name: /Correct \(data\/GPS error\)/i }).click();
    await expect(resolve.getByText(/Correction notes \(required\)/i)).toBeVisible();

    await resolve.getByRole("button", { name: /Flag — do not bill/i }).click();
    await expect(resolve.getByText(/Holds the visit out of billing/i)).toBeVisible();
    await shot(page, "07-resolve-dialog");

    await resolve.getByRole("button", { name: /Cancel/i }).click();
    await expect(resolve).toHaveCount(0);
  });

  test("Residential / Daily tab renders (empty-state or ledger)", async ({ page }) => {
    await openDesk(page);
    await openTab(page, "residential");
    await expect(page.getByText("Date range", { exact: true })).toBeVisible();
    // Fixture has an HHS billing code, or the empty copy if client join fails.
    const empty = page.getByText(/No clients with an active HHS billing code/i);
    const loading = page.getByText(/Loading residential clients/i);
    await expect(empty.or(loading).or(page.getByText(/HHS/i).first())).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "08-residential-daily");
  });

  test("State EVV Archive: filters, Utah CSV button, billing badges, expand", async ({
    page,
  }) => {
    await openDesk(page);
    await openTab(page, "evv-archive");

    await expect(page.getByRole("heading", { name: /State EVV Archive/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search staff, client, member ID/i)).toBeVisible();
    await expect(page.getByText(/All service codes/i).first()).toBeVisible();
    await expect(page.getByText(/All staff/i).first()).toBeVisible();
    await expect(page.getByText(/All clients/i).first()).toBeVisible();
    await expect(page.getByText(/All homes \/ teams/i).first()).toBeVisible();
    await expect(page.getByText(/All billing statuses|Billing status/i).first()).toBeVisible();
    await expect(page.getByLabel("From date")).toBeVisible();
    await expect(page.getByLabel("To date")).toBeVisible();
    await expect(page.getByRole("button", { name: /Export Utah DHHS EVV CSV/i }).first()).toBeVisible();

    await expect(page.getByText("BILLED").first()).toBeVisible();
    await expect(page.getByText("UNBILLED").first()).toBeVisible();
    await expect(page.getByText("HELD").first()).toBeVisible();

    const archiveRow = page.locator("tr[role='button']").filter({ hasText: "Maya Chen" }).first();
    await archiveRow.click();
    await expect(page.getByText("Shift Note").first()).toBeVisible();
    await shot(page, "09-state-evv-archive");

    await page.getByPlaceholder(/Search staff, client, member ID/i).fill("no-such-person-xyz");
    await expect(page.getByText(/No approved shifts match/i)).toBeVisible();
    await page.getByRole("button", { name: /Clear all filters/i }).click();
    await expect(page.getByText("BILLED").first()).toBeVisible();
  });

  test("Internal / Non-EVV Archive: payroll CSV button and filters", async ({ page }) => {
    await openDesk(page);
    await openTab(page, "non-evv-archive");

    await expect(page.getByRole("heading", { name: /Internal \/ Non-EVV Archive/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Export Payroll CSV/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Search staff, client, member ID/i)).toBeVisible();
    await expect(page.getByText("Sam Ortiz").first()).toBeVisible();
    await expect(page.getByText("DSI").first()).toBeVisible();
    // Billing column is EVV-archive only
    await expect(page.getByText("BILLED")).toHaveCount(0);
    await shot(page, "10-internal-archive");
  });

  test("Ask NECTAR: does not search on keystrokes; empty Enter toasts; clear/reset restores tabs", async ({
    page,
  }) => {
    await openDesk(page);
    const search = page.getByPlaceholder(/Search intent via Vector NECTAR/i);
    await expect(search).toBeVisible();
    await expect(page.getByRole("button", { name: /Ask NECTAR/i })).toBeVisible();

    await search.fill("practiced money skills");
    // Keystrokes must not hide tabs / fire search
    await expect(page.getByTestId("compliance-tab-pending")).toBeVisible();
    await expect(page.getByText(/Showing cross-tab query results/i)).toHaveCount(0);

    await search.fill("");
    await search.press("Enter");
    await expect(page.getByText(/Type a question first/i)).toBeVisible();

    await search.fill("practiced money skills");
    await page.getByRole("button", { name: /Ask NECTAR/i }).click();
    await expect(page.getByText(/Showing cross-tab query results/i)).toBeVisible();
    await shot(page, "11-ask-nectar-results");

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByTestId("compliance-tab-pending")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pending EVV Shifts" })).toBeVisible();
  });

  test("GeofenceBadge and GpsBypassBadge variants", async ({ page }) => {
    await openDesk(page);
    await expect(page.getByText("MATCH").first()).toBeVisible();
    await expect(page.getByText("NEEDS RECONCILIATION").first()).toBeVisible();
    const bypassCount = await page.getByText("GPS BYPASSED — ADDRESS USED").count();
    expect(bypassCount).toBe(1);

    await openTab(page, "reconcile");
    await page.getByRole("combobox").filter({ hasText: /Pending/i }).click();
    await page.getByRole("option", { name: "All", exact: true }).click();
    await expect(page.getByText("RECONCILED").first()).toBeVisible();
    await expect(page.getByText("CORRECTED").first()).toBeVisible();
    await expect(page.getByText("FLAGGED").first()).toBeVisible();
  });
});
