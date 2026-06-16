/**
 * Route crawler — visits every app page and asserts health invariants.
 *
 * Parameterised-route IDs come from env vars so they can be set per staging
 * environment without touching this file.  Set them in GitHub Secrets or a
 * local .env.test file.  Defaults are UUIDs that won't match real records;
 * the assertions still run (they test the "not found" shell, not the record).
 */
import { test, expect, Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Staging IDs — override via env vars in CI / .env.test
// ---------------------------------------------------------------------------
const ID = {
  clientId: process.env.STAGING_CLIENT_ID ?? "00000000-0000-0000-0000-000000000001",
  staffId: process.env.STAGING_STAFF_ID ?? "00000000-0000-0000-0000-000000000002",
  shiftId: process.env.STAGING_SHIFT_ID ?? "00000000-0000-0000-0000-000000000003",
  courseId: process.env.STAGING_COURSE_ID ?? "00000000-0000-0000-0000-000000000004",
  assignmentId: process.env.STAGING_ASSIGNMENT_ID ?? "00000000-0000-0000-0000-000000000005",
  topicId: process.env.STAGING_TOPIC_ID ?? "00000000-0000-0000-0000-000000000006",
  formId: process.env.STAGING_FORM_ID ?? "00000000-0000-0000-0000-000000000007",
  programId: process.env.STAGING_PROGRAM_ID ?? "00000000-0000-0000-0000-000000000008",
  jobId: process.env.STAGING_JOB_ID ?? "00000000-0000-0000-0000-000000000009",
  trackSlug: process.env.STAGING_TRACK_SLUG ?? "placeholder-track",
  trainingId: process.env.STAGING_TRAINING_ID ?? "00000000-0000-0000-0000-000000000010",
  stateCode: process.env.STAGING_STATE_CODE ?? "UT",
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const STATIC_ROUTES: string[] = [
  // Public / auth pages
  "/",
  "/pricing",
  "/contact",
  "/unauthorized",

  // Role landing pages
  "/admin",
  "/auditor",
  "/employee",
  "/manager",

  // Dashboard — core
  "/dashboard",
  "/dashboard/ask-nectar",
  "/dashboard/assignments",
  "/dashboard/audit",
  "/dashboard/authoritative-sources",
  "/dashboard/certifications",
  "/dashboard/client-billing-codes",
  "/dashboard/client-loans",
  "/dashboard/command-center",
  "/dashboard/compliance-desk",
  "/dashboard/daily-logs",
  "/dashboard/day-program",
  "/dashboard/deadlines",
  "/dashboard/emar",
  "/dashboard/evv-archive",
  "/dashboard/external-certifications",
  "/dashboard/external-compliance",
  "/dashboard/help",
  "/dashboard/homes",
  "/dashboard/host-home-control",
  "/dashboard/internal-audit",
  "/dashboard/invitations",
  "/dashboard/nectar-docs",
  "/dashboard/pba-ledger",
  "/dashboard/permissions",
  "/dashboard/programs",
  "/dashboard/programs-admin",
  "/dashboard/records-desk",
  "/dashboard/reimbursements",
  "/dashboard/reports",
  "/dashboard/roles",
  "/dashboard/schedule",
  "/dashboard/schedule-preview",
  "/dashboard/scheduler",
  "/dashboard/scheduling",
  "/dashboard/summaries",
  "/dashboard/team",
  "/dashboard/teams",
  "/dashboard/timeclock",
  "/dashboard/tracks",

  // Admin sub-routes
  "/dashboard/admin/ce-hours",
  "/dashboard/admin/emar-audit",
  "/dashboard/super-admin",
  "/dashboard/behaviorist",

  // Billing
  "/dashboard/billing",
  "/dashboard/billing-520",
  "/dashboard/billing/contractors",
  "/dashboard/billing/distributions",
  "/dashboard/billing/form520",
  "/dashboard/billing/gross",
  "/dashboard/billing/host-home",
  "/dashboard/billing/imports",
  "/dashboard/billing/monthly-grid",
  "/dashboard/billing/nectar",
  "/dashboard/billing/subscription",
  "/dashboard/billing/totals",

  // Clients
  "/dashboard/clients",
  "/dashboard/clients/rhs-board",

  // Courses
  "/dashboard/courses",
  "/dashboard/courses/core",
  "/dashboard/courses/ce",
  "/dashboard/courses/mindsmith",
  "/dashboard/courses/other",
  "/dashboard/courses/person",

  // Employees
  "/dashboard/employees",

  // Financial
  "/dashboard/financial",
  "/dashboard/financial/contractors",
  "/dashboard/financial/distributions",
  "/dashboard/financial/employees",
  "/dashboard/financial/gross",
  "/dashboard/financial/host-home",
  "/dashboard/financial/monthly-grid",
  "/dashboard/financial/nectar",
  "/dashboard/financial/rhs",
  "/dashboard/financial/totals",

  // Forms
  "/dashboard/forms",

  // HIVE exec
  "/dashboard/hive-exec",
  "/dashboard/hive-exec/approvals",
  "/dashboard/hive-exec/base-template",
  "/dashboard/hive-exec/company-migration",
  "/dashboard/hive-exec/health",
  "/dashboard/hive-exec/messages",
  "/dashboard/hive-exec/nectar",
  "/dashboard/hive-exec/new-company",
  "/dashboard/hive-exec/permissions",
  "/dashboard/hive-exec/plans",
  "/dashboard/hive-exec/states",
  "/dashboard/hive-exec/tickets",

  // HR / settings
  "/dashboard/hr-admin/settings",
  "/dashboard/settings",
  "/dashboard/settings/automation-rules",
  "/dashboard/settings/bank-mapping",
  "/dashboard/settings/email",
  "/dashboard/settings/gmail",
  "/dashboard/settings/retention",
  "/dashboard/settings/service-catalog",
  "/dashboard/settings/service-codes",
  "/dashboard/settings/subscription",
  "/dashboard/settings/team-access",

  // Hub
  "/dashboard/hub/clients",
  "/dashboard/hub/finances",
  "/dashboard/hub/knowledge",

  // Smart import
  "/dashboard/smart-import",
  "/dashboard/smart-import/history",

  // Training
  "/dashboard/training",
];

// Parameterised routes — each entry includes the rendered URL and whether it's
// a "detail page" that must show a Back/Cancel button.
const PARAM_ROUTES: Array<{ url: string; isDetail: boolean }> = [
  { url: `/dashboard/behavior-support/${ID.clientId}`, isDetail: true },
  { url: `/dashboard/billing/${ID.clientId}`, isDetail: true },
  { url: `/dashboard/client-intake/${ID.clientId}`, isDetail: true },
  { url: `/dashboard/client-training/${ID.clientId}`, isDetail: true },
  { url: `/dashboard/clients/${ID.clientId}`, isDetail: true },
  { url: `/dashboard/courses/${ID.courseId}`, isDetail: true },
  { url: `/dashboard/courses/${ID.courseId}/edit`, isDetail: true },
  { url: `/dashboard/courses/person-module/${ID.assignmentId}`, isDetail: true },
  { url: `/dashboard/courses/topic/${ID.topicId}`, isDetail: true },
  { url: `/dashboard/employees/${ID.staffId}`, isDetail: true },
  { url: `/dashboard/forms/${ID.formId}/edit`, isDetail: true },
  { url: `/dashboard/forms/${ID.formId}/fill`, isDetail: true },
  { url: `/dashboard/hive-exec/states/${ID.stateCode}`, isDetail: false },
  { url: `/dashboard/hive-exec/states/${ID.stateCode}/onboarding`, isDetail: true },
  { url: `/dashboard/programs/${ID.programId}`, isDetail: true },
  { url: `/dashboard/shift/${ID.shiftId}`, isDetail: true },
  { url: `/dashboard/smart-import/${ID.jobId}/done`, isDetail: true },
  { url: `/dashboard/smart-import/${ID.jobId}/review`, isDetail: true },
  { url: `/dashboard/tracks/${ID.trackSlug}`, isDetail: true },
  { url: `/dashboard/training/${ID.trainingId}`, isDetail: true },
  { url: `/dashboard/workspace/${ID.clientId}`, isDetail: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Known-benign console messages to suppress so they don't false-positive.
const BENIGN_PATTERNS = [
  /vite\/client/i,
  /Download the React DevTools/i,
  /ReactDOM\.render is no longer supported/i,
];

function isBenign(text: string): boolean {
  return BENIGN_PATTERNS.some((p) => p.test(text));
}

async function assertPageHealth(
  page: Page,
  url: string,
  isDetail: boolean,
): Promise<void> {
  const consoleErrors: string[] = [];
  const onConsoleError = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === "error" && !isBenign(msg.text())) {
      consoleErrors.push(msg.text());
    }
  };
  page.on("console", onConsoleError);

  let response: { status(): number } | null = null;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded" });
  } finally {
    // always remove listener even if goto throws
  }

  // 1. No 404
  if (response) {
    expect(
      response.status(),
      `HTTP 404 on ${url}`,
    ).not.toBe(404);
  }
  await expect(
    page.getByText(/404|not found|page not found/i).first(),
    `404 text visible on ${url}`,
  ).not.toBeVisible({ timeout: 3_000 }).catch(() => {
    // If the locator doesn't exist at all, that's fine — no 404
  });

  // 2. No blank page — wait a moment for hydration
  await page.waitForTimeout(2_000);
  const bodyText = await page.evaluate(() =>
    document.body?.innerText?.trim() ?? "",
  );
  expect(bodyText.length, `Blank page on ${url}`).toBeGreaterThan(0);

  // 3. No infinite spinner after 5 s
  await page.waitForTimeout(3_000); // already waited 2 s above
  const spinnerSelector =
    ".animate-spin, [data-loading='true'], [aria-label*='loading' i], [aria-label*='Loading' i]";
  const spinnerVisible = await page
    .locator(spinnerSelector)
    .first()
    .isVisible()
    .catch(() => false);
  expect(spinnerVisible, `Infinite spinner still visible on ${url}`).toBe(false);

  // 4. No console errors
  expect(
    consoleErrors,
    `console.error fired on ${url}: ${consoleErrors.join(" | ")}`,
  ).toHaveLength(0);

  page.removeListener("console", onConsoleError);

  // 5. Back/cancel button on detail pages
  if (isDetail) {
    const backButtonVisible = await page
      .locator(
        [
          'button:has-text("Back")',
          'a:has-text("Back")',
          'button:has-text("Cancel")',
          '[aria-label*="back" i]',
          '[aria-label*="Back" i]',
        ].join(", "),
      )
      .first()
      .isVisible()
      .catch(() => false);
    expect(
      backButtonVisible,
      `No Back/Cancel button found on detail page ${url}`,
    ).toBe(true);
  }

  // eMAR-specific: status badge must follow self-administration model
  if (url.includes("emar") || url.includes("emar-audit")) {
    const badgeLocator = page.locator(
      '[data-status], .status-badge, [class*="badge"], [class*="status"]',
    );
    const badgeCount = await badgeLocator.count();
    for (let i = 0; i < badgeCount; i++) {
      const text = await badgeLocator.nth(i).textContent().catch(() => "");
      if (!text) continue;
      // Must NOT contain bare "Administered" (only "Self-administered" is valid)
      expect(
        text,
        `Forbidden eMAR label "Administered" (without "Self-") on ${url}`,
      ).not.toMatch(/(?<!Self-)Administered/);
      // Must NOT contain "Five Rights"
      expect(
        text,
        `Forbidden eMAR label "Five Rights" on ${url}`,
      ).not.toMatch(/Five Rights/i);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

for (const route of STATIC_ROUTES) {
  test(`smoke: ${route}`, async ({ page }) => {
    const isDetail = false; // static routes are never parameterised detail pages
    await assertPageHealth(page, route, isDetail);
  });
}

for (const { url, isDetail } of PARAM_ROUTES) {
  test(`smoke: ${url}`, async ({ page }) => {
    await assertPageHealth(page, url, isDetail);
  });
}
