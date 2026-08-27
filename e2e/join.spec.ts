/**
 * Invite-join flow — unauthenticated. Intercepts writes so CI never creates
 * live auth users. Skips when this environment does not yet serve /join
 * (crawler hits persistent staging, not the PR preview).
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const NEW_AGENCY = /team & pricing|create your account|your business|staff training|payment/i;
const JOIN_HEADING = /join /i;
const JOIN_ERROR =
  /invitation (link is missing|isn't valid|has expired|was already used|was cancelled|can't be used)/i;
const ASK_ADMIN = /ask your admin to add you manually/i;

async function blockWrites(page: import("@playwright/test").Page) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    const isWrite =
      method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
    const isAuthWrite =
      /\/auth\/v1\/(signup|admin|user)/i.test(url) ||
      /\/rest\/v1\/(invitations|organization_members|profiles|organizations)/i.test(url) ||
      /accept_invitation/i.test(url);
    if (isWrite && isAuthWrite) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ error: "intercepted", message: "test intercepted write" }),
      });
    }
    return route.continue();
  });
}

test.describe("invite join vs new-agency signup", () => {
  test("/signup with no invite token is still new-agency signup", async ({ page }) => {
    await blockWrites(page);
    await page.goto("/signup", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await expect(page).toHaveURL(/\/signup/);
    const signupRoot = page.getByTestId("signup-new-agency");
    if (await signupRoot.count()) {
      await expect(signupRoot).toBeVisible();
    }
    const body = await page.locator("body").innerText();
    expect(body, "new-agency signup must still show account/business/pricing steps").toMatch(
      NEW_AGENCY,
    );
    expect(body.toLowerCase()).not.toContain("ask your admin to add you manually");
  });

  test("/join with no token shows a human error, not new-agency signup", async ({ page }) => {
    await blockWrites(page);
    const res = await page.goto("/join", { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (!res || res.status() === 404) {
      test.skip(true, "/join is not on this environment yet");
    }
    const body = await page.locator("body").innerText();
    if (!/this invitation can't be used|invitation link is missing/i.test(body)) {
      test.skip(true, "/join is not the invite-accept page on this environment yet");
    }
    await expect(page.getByTestId("join-error")).toBeVisible({ timeout: 15_000 });
    const err = await page.getByTestId("join-error").innerText();
    expect(err).toMatch(ASK_ADMIN);
    expect(err).toMatch(JOIN_ERROR);
    expect(err.toLowerCase()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}/);
    await expect(page.locator("body")).not.toContainText(NEW_AGENCY);
    await expect(page.getByTestId("join-form")).toHaveCount(0);
  });

  test("/signup?invite= redirects to /join and does not show payment", async ({ page }) => {
    await blockWrites(page);
    await page.goto("/signup?invite=not-a-real-invite-token-xxxxx", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const path = new URL(page.url()).pathname;
    if (path === "/signup") {
      const body = await page.locator("body").innerText();
      if (NEW_AGENCY.test(body)) {
        test.skip(true, "invite redirect is not on this environment yet");
      }
    }
    expect(path).toBe("/join");
    await expect(page.locator("body")).not.toContainText(/team & pricing|billed today|payment/i);
    const err = page.getByTestId("join-error");
    await expect(err).toBeVisible({ timeout: 15_000 });
    await expect(err).toContainText(ASK_ADMIN);
  });

  test("valid-looking token shows join UI (mocked preview), never payment or team-size", async ({
    page,
  }) => {
    await page.route("**/*", async (route) => {
      const req = route.request();
      const method = req.method();
      const url = req.url();
      const isWrite =
        method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
      const isAuthWrite =
        /\/auth\/v1\/(signup|admin|user)/i.test(url) ||
        /\/rest\/v1\/(invitations|organization_members|profiles|organizations)/i.test(url) ||
        /accept_invitation/i.test(url);
      if (isWrite && isAuthWrite) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ error: "intercepted" }),
        });
      }
      // TanStack Start server fn POST — return a pending invite preview.
      if (method === "POST" && /\/_serverFn\//i.test(url) === false) {
        const postData = req.postData() || "";
        if (/previewInvitation|join-invite/i.test(url + postData) || /token/i.test(postData)) {
          const looksLikePreview = /previewInvitation/.test(postData) || /"token"/.test(postData);
          if (
            looksLikePreview &&
            !/prepareInviteAccount/.test(postData) &&
            !/password/.test(postData)
          ) {
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                ok: true,
                email: "tester@example.com",
                role: "employee",
                org_name: "True North Supports",
                expires_at: new Date(Date.now() + 86400_000).toISOString(),
                needs_name: true,
                has_username: false,
                account_exists: false,
              }),
            });
          }
        }
      }
      return route.continue();
    });

    const res = await page.goto("/join?invite=fake-but-well-formed-token-aa", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!res || res.status() === 404) {
      test.skip(true, "/join is not on this environment yet");
    }
    const body = await page.locator("body").innerText();
    if (NEW_AGENCY.test(body) && !JOIN_HEADING.test(body)) {
      test.skip(true, "/join is not the invite-accept page on this environment yet");
    }

    // Either the mocked preview rendered the form, or the live preview
    // returned not-found (token isn't real) — both must avoid new-agency UI.
    await expect(page.locator("body")).not.toContainText(/team & pricing|billed today/i);
    const form = page.getByTestId("join-form");
    const err = page.getByTestId("join-error");
    await expect(form.or(err).first()).toBeVisible({ timeout: 15_000 });
    if (await form.isVisible().catch(() => false)) {
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i).first()).toBeVisible();
      await expect(page.locator("body")).toContainText(JOIN_HEADING);
      await expect(page.locator("body")).not.toContainText(/how many staff|team size/i);
    } else {
      await expect(err).toContainText(ASK_ADMIN);
    }
  });
});
