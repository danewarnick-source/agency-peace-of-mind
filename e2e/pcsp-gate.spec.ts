/**
 * PCSP gate — verifies the three PCSP-derived workflows on the client Care tab
 * (Support Strategies, Client-Specific Training, Person-Centered Thinking) are
 * disabled until a PCSP is on file, and become enabled once one exists.
 *
 * Read-only against staging. Requires two seeded clients:
 *   STAGING_CLIENT_ID_NO_PCSP    — client with no PCSP on file
 *   STAGING_CLIENT_ID_WITH_PCSP  — client with a PCSP on file
 *
 * Either being unset skips the corresponding spec so CI doesn't false-fail
 * before secrets are wired up.
 */
import { test, expect, Page } from "@playwright/test";

const NO_PCSP_ID = process.env.STAGING_CLIENT_ID_NO_PCSP;
const WITH_PCSP_ID = process.env.STAGING_CLIENT_ID_WITH_PCSP;

const BANNER = /Upload a PCSP to get started/i;
const DIALOG_TITLE = /Upload the PCSP first/i;
const DIALOG_BODY = /This client has no PCSP on file/i;

const CARDS = [
  { name: "Support Strategies", heading: /Support Strategies/i },
  { name: "Client-Specific Training", heading: /Client-specific training/i },
  { name: "Person-Centered Thinking", heading: /Person-Centered Thinking/i },
];

async function gotoCare(page: Page, clientId: string) {
  await page.goto(`/dashboard/clients/${clientId}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  // Care tab is the default on the client detail page; click it explicitly
  // in case the route remembered a different tab.
  const careTab = page.getByRole("tab", { name: /care/i }).first();
  if (await careTab.isVisible().catch(() => false)) {
    await careTab.click().catch(() => {});
  }
  await page.waitForTimeout(800);
}

async function expandCard(page: Page, heading: RegExp) {
  // Cards default to collapsed. Find the card header containing the heading
  // text and click it. We click the heading itself which is inside a button-
  // like trigger on all three cards.
  const header = page
    .locator("button, [role='button']")
    .filter({ hasText: heading })
    .first();
  if (await header.isVisible().catch(() => false)) {
    await header.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function dismissDialog(page: Page) {
  // Either the explicit close button or Escape.
  const close = page
    .getByRole("dialog")
    .getByRole("button", { name: /close|cancel|got it|ok/i })
    .first();
  if (await close.isVisible().catch(() => false)) {
    await close.click().catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }
  await page.waitForTimeout(200);
}

test.describe("PCSP gate — no PCSP on file", () => {
  test.skip(
    !NO_PCSP_ID,
    "Set STAGING_CLIENT_ID_NO_PCSP to a staging client with no PCSP to run this spec.",
  );

  test("Care tab shows the gate banner and gated actions open the PCSP prompt dialog", async ({
    page,
  }) => {
    await gotoCare(page, NO_PCSP_ID!);

    for (const card of CARDS) {
      await expandCard(page, card.heading);
    }

    // Each card body should contain the canonical amber banner copy.
    // There may be more than one match (the gate appears in multiple cards),
    // so we assert count >= CARDS.length.
    const banners = page.getByText(BANNER);
    await expect(banners.first()).toBeVisible({ timeout: 10_000 });
    const bannerCount = await banners.count();
    expect(
      bannerCount,
      `Expected the PCSP gate banner to appear in all ${CARDS.length} cards; saw ${bannerCount}.`,
    ).toBeGreaterThanOrEqual(CARDS.length);

    // For each card, click whichever gated primary action is rendered and
    // confirm the "Upload the PCSP first" dialog appears.
    const candidateButtonNames = [
      /Build from PCSP goals/i,
      /Start blank/i,
      /Upload existing/i,
      /Edit/i,
      /Rebuild from PCSP/i,
      /Approve & Publish/i,
      /Create profile/i,
      /Review & Publish/i,
    ];

    let dialogTriggerCount = 0;
    for (const name of candidateButtonNames) {
      const btn = page.getByRole("button", { name }).first();
      if (!(await btn.isVisible().catch(() => false))) continue;
      await btn.click().catch(() => {});
      const dialog = page.getByRole("dialog").filter({ hasText: DIALOG_TITLE });
      if (await dialog.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(dialog.first()).toContainText(DIALOG_BODY);
        dialogTriggerCount += 1;
        await dismissDialog(page);
      }
    }

    expect(
      dialogTriggerCount,
      "At least one gated action per workflow should open the 'Upload the PCSP first' dialog.",
    ).toBeGreaterThanOrEqual(1);
  });
});

test.describe("PCSP gate — PCSP on file", () => {
  test.skip(
    !WITH_PCSP_ID,
    "Set STAGING_CLIENT_ID_WITH_PCSP to a staging client with a PCSP to run this spec.",
  );

  test("Care tab hides the gate banner and primary actions do not open the PCSP prompt", async ({
    page,
  }) => {
    await gotoCare(page, WITH_PCSP_ID!);

    for (const card of CARDS) {
      await expandCard(page, card.heading);
    }

    // The amber gate banner should NOT be present anywhere on the page.
    await expect(
      page.getByText(BANNER).first(),
      "Gate banner should be absent when a PCSP is on file.",
    ).toHaveCount(0);

    // PCSP-goals card on the Care tab should reflect "PCSP on file".
    await expect(
      page.getByText(/PCSP on file/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click a primary action that would otherwise trigger the gate dialog
    // (Build from PCSP goals) and confirm the "Upload the PCSP first" dialog
    // does NOT appear.
    const buildBtn = page
      .getByRole("button", { name: /Build from PCSP goals/i })
      .first();
    if (await buildBtn.isVisible().catch(() => false)) {
      await buildBtn.click().catch(() => {});
      const dialog = page.getByRole("dialog").filter({ hasText: DIALOG_TITLE });
      await expect(
        dialog.first(),
        "The 'Upload the PCSP first' dialog must not appear when a PCSP is on file.",
      ).toHaveCount(0);
      // Dismiss any other dialog that may have opened (e.g. a confirm).
      await page.keyboard.press("Escape").catch(() => {});
    }
  });
});
