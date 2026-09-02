/**
 * Hive Training / Launchpad gate — Sep 1 clock-in block.
 *
 * Mock auth only. Does not sign in as live staff and does not write production
 * completions. The staging flag flip for named testers (Dane Warnick, Jake
 * Probert, Harvey Alisa, Tom Jones) is a TEST override, not real completion,
 * and is not treated as a product allow-list here.
 *
 * Run: npm run test:e2e
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IDS,
  UUID_RE,
  installHiveE2E,
  type HiveE2EWorld,
  type WriteAttempt,
} from "./helpers/hive-training-mock";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.join(__dirname, "artifacts");

function shot(page: Page, name: string) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  return page.screenshot({
    path: path.join(ARTIFACT_DIR, `${name}.png`),
    fullPage: true,
  });
}

async function openAs(page: Page, world: HiveE2EWorld, writes: WriteAttempt[]) {
  await installHiveE2E(page, world, writes);
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 40.7608, longitude: -111.891 });
}

async function waitSettled(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1_200);
}

/** Staff view mounts PunchPad / hub twice (mobile shell is md:hidden). */
function visibleTestId(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

async function dismissEvvConsent(page: Page) {
  const consent = page.getByRole("button", { name: /I Consent & Allow Tracking/i });
  if (await consent.first().isVisible().catch(() => false)) {
    await consent.first().click();
    await page.waitForTimeout(400);
  }
}

function completionWrites(writes: WriteAttempt[]): WriteAttempt[] {
  const blocked = new Set([
    "training_completions",
    "hive_training_certificates",
    "evv_timesheets",
  ]);
  return writes.filter((w) => blocked.has(w.table));
}

test("1. Admin can open Hive Training without crash", async ({ page }) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "admin", hasPassedLaunchpad: true }, writes);
  await page.goto("/dashboard/hive-training", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Loading workspace/i)).toHaveCount(0, { timeout: 40_000 });
  await expect(page.getByTestId("hive-training-hub")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await expect(page.getByText(/^Training$/).first()).toBeVisible();
  await shot(page, "01-hive-training-admin");
  expect(completionWrites(writes), "must not write live completions").toHaveLength(0);
});

test("2. Staff Hive Training shop is gone — staff land on My Obligations", async ({
  page,
}) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "employee", hasPassedLaunchpad: false }, writes);

  await page.goto("/dashboard/hive-training", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard\/my-obligations/, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: /My Obligations/i }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Training Catalog/i);
  await shot(page, "02-hive-training-staff-redirect");

  await page.goto(`/dashboard/hive-training/course/${IDS.assignment}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(/\/dashboard\/my-obligations/, { timeout: 20_000 });
  await shot(page, "02b-hive-training-player-redirect");

  expect(completionWrites(writes)).toHaveLength(0);
});

test("3. Incomplete staff cannot clock in — punch pad shows a clear block, not a UUID", async ({
  page,
}) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "employee", hasPassedLaunchpad: false }, writes);

  await page.goto(`/dashboard/workspace/${IDS.client}?tab=clock-in&code=SLH`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await dismissEvvConsent(page);
  const block = visibleTestId(page, "launchpad-gate-block");
  await expect(block).toBeVisible({ timeout: 20_000 });
  const blockText = (await block.innerText()).trim();
  expect(blockText, "block copy must mention Launchpad").toMatch(/Launchpad/i);
  expect(blockText, "block must not be a raw UUID error").not.toMatch(UUID_RE);
  const clockIn = visibleTestId(page, "clock-in-button");
  if (await clockIn.isVisible().catch(() => false)) {
    await expect(clockIn).toBeDisabled();
  }
  await shot(page, "03-clock-in-blocked");

  expect(
    writes.filter((w) => w.table === "evv_timesheets"),
    "blocked staff must not insert a timesheet",
  ).toHaveLength(0);
  expect(completionWrites(writes)).toHaveLength(0);
});

test("4. Passed Launchpad allows clock-in UI to proceed (does not punch)", async ({
  page,
}) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "employee", hasPassedLaunchpad: true }, writes);

  await page.goto(`/dashboard/workspace/${IDS.client}?tab=clock-in&code=SLH`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await dismissEvvConsent(page);
  await expect(page.getByTestId("launchpad-gate-block")).toHaveCount(0);
  const clockIn = visibleTestId(page, "clock-in-button");
  await expect(clockIn).toBeVisible({ timeout: 20_000 });
  await expect(clockIn).toBeEnabled();
  await expect(page.getByText(/START EVV SHIFT|▶️ CLOCK IN/i).filter({ visible: true })).toBeVisible();
  await shot(page, "04-clock-in-allowed");
  // Do not click — we never punch in e2e.
  expect(writes.filter((w) => w.table === "evv_timesheets")).toHaveLength(0);
});

test("5. Admin roster shows who has / has not passed Launchpad", async ({ page }) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "admin", hasPassedLaunchpad: true }, writes);

  await page.goto("/dashboard/hive-training", { waitUntil: "domcontentloaded" });
  const roster = page.getByTestId("launchpad-roster");
  await expect(roster).toBeVisible({ timeout: 20_000 });
  await expect(roster).toContainText(/Launchpad clock-in gate/i);
  await expect(roster).toContainText(/passed/i);
  await expect(roster).toContainText(/have not passed/i);
  await expect(roster).toContainText("E2E Admin");
  await expect(roster).toContainText("E2E Incomplete");
  await shot(page, "05-launchpad-roster");
  expect(completionWrites(writes)).toHaveLength(0);
});

test("6. Leftover catalog and LMS shop pages redirect; public /training has no seat shop", async ({
  page,
}) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "admin", hasPassedLaunchpad: true }, writes);

  await page.goto("/training", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Staff training lives in the office/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("body")).not.toContainText(/à la carte|Full training program|Add to cart/i);
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await shot(page, "06-public-training");

  await page.goto("/dashboard/training", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard\/my-obligations/, { timeout: 15_000 });
  await shot(page, "06b-dashboard-training");

  await page.goto("/dashboard/training/catalog", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard\/hive-training/, { timeout: 15_000 });
  await expect(page.getByTestId("hive-training-hub")).toBeVisible({ timeout: 15_000 });
  await shot(page, "06c-training-catalog");

  await page.goto("/dashboard/courses", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard\/my-obligations/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: /My Obligations/i }).filter({ visible: true }).first(),
  ).toBeVisible();
  await shot(page, "06d-courses");

  await page.goto("/dashboard/courses/core", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard\/my-obligations/, { timeout: 15_000 });
  await shot(page, "06e-courses-core");

  await page.goto(`/dashboard/courses/topic/${IDS.topicReady}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(/\/dashboard\/my-obligations/, { timeout: 15_000 });
  await shot(page, "06f-topic-player");

  await page.goto(`/dashboard/training/${IDS.trainingModule}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(/\/dashboard\/my-obligations/, { timeout: 15_000 });
  await shot(page, "06g-training-module");

  await page.goto("/dashboard/programs", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard\/my-obligations/, { timeout: 15_000 });
  await shot(page, "06h-programs");

  expect(
    writes.filter((w) => w.table === "training_completions" || w.table === "hive_training_certificates"),
    "must not ship fake completions",
  ).toHaveLength(0);
});
