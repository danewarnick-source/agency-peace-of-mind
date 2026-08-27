import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, ".auth.json");

export default async function globalSetup() {
  const stagingUrl = process.env.STAGING_URL;
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  // Mocked admin-scheduler tests (npm run test:e2e) do not need staging login.
  if (!stagingUrl || !email || !password) return;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${stagingUrl}/login`);

  // Fill the "Email or username" field (name="identifier", id="identifier")
  await page.fill("#identifier", email);
  // Fill the password field (name="password", id="password")
  await page.fill("#password", password);
  // Click the amber "Sign in" submit button
  await page.click('button[type="submit"]');

  // Wait for the post-login redirect to the dashboard
  await page
    .waitForURL((url) => url.pathname.startsWith("/dashboard"), {
      timeout: 20_000,
    })
    .catch(() => {
      throw new Error(
        `Login failed: still on ${page.url()} after submit. ` +
          `Check TEST_EMAIL / TEST_PASSWORD and that the staging app is reachable at ${stagingUrl}.`,
      );
    });

  await context.storageState({ path: AUTH_FILE });
  await browser.close();
}
