/**
 * Punch-pad GPS / home-pin geofence.
 *
 * Mocked auth + roster. Does not write live timesheets.
 * Run: npx playwright test --config=playwright.1056.config.ts e2e/punch-pad-gps.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { CLIENTS } from "./fixtures/tns-1056";
import {
  assertPageNotBlank,
  installHiveMocks,
  waitForDashboard,
} from "./helpers/mock-hive-1056";

test.use({ storageState: { cookies: [], origins: [] } });

const LOCAL_SHOTS = path.join(process.cwd(), "test-results", "punch-pad-gps");
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

type GpsMode = "ok" | "denied";

async function mockGps(
  page: Page,
  opts: { lat: number; lng: number; acc: number; mode?: GpsMode },
) {
  await page.addInitScript(
    ({ lat, lng, acc, mode }) => {
      const geo = {
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        getCurrentPosition(
          success: (pos: GeolocationPosition) => void,
          error?: (err: GeolocationPositionError) => void,
        ) {
          if (mode === "denied") {
            error?.({
              code: 1,
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
              message: "denied",
            } as GeolocationPositionError);
            return;
          }
          success({
            coords: {
              latitude: lat,
              longitude: lng,
              accuracy: acc,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON() {
                return this;
              },
            },
            timestamp: Date.now(),
            toJSON() {
              return this;
            },
          } as GeolocationPosition);
        },
        watchPosition(
          success: (pos: GeolocationPosition) => void,
          error?: (err: GeolocationPositionError) => void,
        ) {
          this.getCurrentPosition(success, error);
          return 1;
        },
        clearWatch() {},
      };
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: geo,
      });
    },
    { lat: opts.lat, lng: opts.lng, acc: opts.acc, mode: opts.mode ?? "ok" },
  );
}

async function openPunchPad(page: Page) {
  await page.goto(`/dashboard/workspace/${CLIENTS.tommy.id}?tab=clock-in`, {
    waitUntil: "domcontentloaded",
  });
  await waitForDashboard(page);
  const clock = page.getByRole("region", { name: /Time Clock|EVV Shift Punch Pad/i });
  await expect(clock).toBeVisible({ timeout: 15_000 });
  return clock;
}

const HOME = { lat: 40.7608, lng: -111.891 };

test.describe("Admin home pin", () => {
  test("identity tab shows home pin controls", async ({ page }) => {
    await installHiveMocks(page, { persona: "admin" });
    await page.goto(`/dashboard/clients/${CLIENTS.tommy.id}?tab=identity`, {
      waitUntil: "domcontentloaded",
    });
    await waitForDashboard(page);
    await expect(page.getByRole("heading", { name: /Tommy Jones/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("home-location-section")).toBeVisible({ timeout: 15_000 });
    const pinHeading = page.getByTestId("home-location-section").getByRole("heading", { name: /Home location/i });
    await expect(pinHeading).toBeVisible({ timeout: 15_000 });
    await pinHeading.scrollIntoViewIfNeeded();
    await expect(page.getByText(/Move the pin if this is the wrong house/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Save address & drop pin/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Use my current location/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Guess pin from address/i })).toBeVisible();
    await expect(page.getByTestId("home-pin-map")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 15_000 });
    await assertPageNotBlank(page, "home pin card");
    await shot(page, "home_pin_map_on_client_page");

    // Tap the map → draft pin (main admin correction, not GPS-at-the-house).
    await page.locator(".leaflet-container").click({ position: { x: 220, y: 160 } });
    const savePin = page.getByRole("button", { name: /Save this pin/i });
    await expect(page.getByText(/The pin moved\. Save it so clock-in uses this house/i)).toBeVisible({
      timeout: 8_000,
    });
    await expect(savePin).toBeVisible();
    await savePin.scrollIntoViewIfNeeded();
    await shot(page, "home_pin_map_after_tap");
  });
});

test.describe("Punch pad GPS geofence", () => {
  test("high-accuracy at the saved pin is inside the zone", async ({ page }) => {
    await mockGps(page, { ...HOME, acc: 12 });
    await installHiveMocks(page, { persona: "dsp" });
    const clock = await openPunchPad(page);
    const combo = clock.getByRole("combobox");
    await combo.click();
    await page.getByRole("option", { name: /SLH/i }).click();
    await expect(clock.getByText(/GPS Live/i)).toBeVisible({ timeout: 10_000 });
    await expect(clock.getByText(/saved home pin/i)).toBeVisible();
    await expect(clock.getByText(/Outside the/i)).toHaveCount(0);
    await shot(page, "punch_pad_inside_saved_pin");
  });

  test("high-accuracy ~0.9 mi away shows out-of-zone against the saved pin", async ({ page }) => {
    await mockGps(page, { lat: 40.768, lng: -111.845, acc: 12 });
    await installHiveMocks(page, { persona: "dsp" });
    const clock = await openPunchPad(page);
    await clock.getByRole("combobox").click();
    await page.getByRole("option", { name: /SLH/i }).click();
    await expect(
      clock.getByText(/Outside the .* zone around the saved home pin/i),
    ).toBeVisible({ timeout: 10_000 });
    await expect(clock.getByText(/This is not “GPS is off.”/i)).toBeVisible();
    await shot(page, "punch_pad_outside_saved_pin");

    await clock.getByRole("button", { name: /Clock In|Start EVV Shift/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/saved home pin/i)).toBeVisible();
    await expect(dialog.getByText(/Distance from the saved home pin/i)).toBeVisible();
    await shot(page, "punch_pad_variance_saved_pin_copy");
  });

  test("coarse GPS is not an out-of-zone verdict", async ({ page }) => {
    await mockGps(page, { ...HOME, acc: 450 });
    await installHiveMocks(page, { persona: "dsp" });
    const clock = await openPunchPad(page);
    await clock.getByRole("combobox").click();
    await page.getByRole("option", { name: /SLH/i }).click();
    await expect(clock.getByText(/GPS is too coarse/i)).toBeVisible({ timeout: 10_000 });
    await expect(clock.getByText(/not an out-of-zone reading/i)).toBeVisible();
    await shot(page, "punch_pad_coarse_gps_retry");
  });

  test("no GPS refuses clock-in (fail-closed)", async ({ page }) => {
    await mockGps(page, { ...HOME, acc: 12, mode: "denied" });
    const handle = await installHiveMocks(page, { persona: "dsp" });
    const clock = await openPunchPad(page);
    await clock.getByRole("combobox").click();
    await page.getByRole("option", { name: /SLH/i }).click();
    await expect(clock.getByText(/GPS Blocked|Location blocked/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await clock.getByTestId("clock-in-button").click();
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /Location is blocked/i }),
    ).toBeVisible({ timeout: 10_000 });
    expect(handle.mutatingRest.filter((c) => c.table === "evv_timesheets")).toHaveLength(0);
    await shot(page, "punch_pad_gps_denied_fail_closed");
  });
});
