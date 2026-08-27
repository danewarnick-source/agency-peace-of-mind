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
  await waitSettled(page);
  await shot(page, "01-hive-training-admin");

  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await expect(page.getByTestId("hive-training-hub")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/HIVE Training/i).first()).toBeVisible();
  expect(completionWrites(writes), "must not write live completions").toHaveLength(0);
});

test("2. Staff Hive Training list + assignment player render locked vs available", async ({
  page,
}) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "employee", hasPassedLaunchpad: false }, writes);

  await page.goto("/dashboard/hive-training", { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await shot(page, "02-hive-training-staff-list");

  await expect(page.getByTestId("hive-training-hub")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Assigned trainings/i).first()).toBeVisible();
  await expect(page.getByText(/DSPD Provider Orientation/i).first()).toBeVisible();
  await expect(page.getByText(/In progress/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue/i }).first()).toBeVisible();

  await page.goto(`/dashboard/hive-training/course/${IDS.assignment}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await shot(page, "02b-hive-training-player");

  await expect(page.getByTestId("hive-training-player")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Welcome to Launchpad/i).first()).toBeVisible();
  await expect(page.getByText(/Competency check/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Mark complete/i }).first()).toBeVisible();
  // Do not click Mark complete — that would be a fake completion.

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
  await page.waitForTimeout(1_500);
  await shot(page, "03-clock-in-blocked");

  const block = page.getByTestId("launchpad-gate-block");
  await expect(block).toBeVisible({ timeout: 20_000 });
  const blockText = (await block.innerText()).trim();
  expect(blockText, "block copy must mention Launchpad").toMatch(/Launchpad/i);
  expect(blockText, "block must not be a raw UUID error").not.toMatch(UUID_RE);

  const clockIn = page.getByTestId("clock-in-button");
  if (await clockIn.isVisible().catch(() => false)) {
    await expect(clockIn).toBeDisabled();
  }

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
  await page.waitForTimeout(1_500);
  await shot(page, "04-clock-in-allowed");

  await expect(page.getByTestId("launchpad-gate-block")).toHaveCount(0);
  await expect(page.getByTestId("clock-in-button")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/CLOCK IN|START EVV SHIFT/i).first()).toBeVisible();
  // Do not click — we never punch in e2e.
  expect(writes.filter((w) => w.table === "evv_timesheets")).toHaveLength(0);
});

test("5. Admin roster shows who has / has not passed Launchpad", async ({ page }) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "admin", hasPassedLaunchpad: true }, writes);

  await page.goto("/dashboard/hive-training", { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await shot(page, "05-launchpad-roster");

  const roster = page.getByTestId("launchpad-roster");
  await expect(roster).toBeVisible({ timeout: 20_000 });
  await expect(roster).toContainText(/Launchpad clock-in gate/i);
  await expect(roster).toContainText(/passed/i);
  await expect(roster).toContainText(/have not passed/i);
  await expect(roster).toContainText("E2E Admin");
  await expect(roster).toContainText("E2E Incomplete");
  expect(completionWrites(writes)).toHaveLength(0);
});

test("6. Training catalog, courses, public /training, and core list do not crash", async ({
  page,
}) => {
  const writes: WriteAttempt[] = [];
  await openAs(page, { role: "admin", hasPassedLaunchpad: true }, writes);

  await page.goto("/training", { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await shot(page, "06-public-training");
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await expect(page.getByText(/HIVE Training|Certifications|Staff Training/i).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/dashboard/training", { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await shot(page, "06b-dashboard-training");
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);

  await page.goto("/dashboard/training/catalog", { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await shot(page, "06c-training-catalog");
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await expect(page.getByText(/Training Catalog|HIVE Training/i).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/dashboard/courses", { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await shot(page, "06d-courses");
  await expect(page.getByText(/My Trainings|30 Day Core Training/i).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/dashboard/courses/core", { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  await shot(page, "06e-courses-core");
  await expect(page.getByTestId("core-training-list")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("core-topic-seizure_disorders")).toHaveAttribute(
    "data-status",
    "completed",
  );
  await expect(page.getByTestId("core-topic-agency_policies")).toHaveAttribute(
    "data-status",
    "not_started",
  );

  await page.goto(`/dashboard/courses/topic/${IDS.topicReady}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await shot(page, "06f-topic-player");
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  // Review-only — do not click Sign & Complete.

  await page.goto(`/dashboard/training/${IDS.trainingModule}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await shot(page, "06g-training-module");
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);

  expect(
    writes.filter((w) => w.table === "training_completions" || w.table === "hive_training_certificates"),
    "must not ship fake completions",
  ).toHaveLength(0);
});
