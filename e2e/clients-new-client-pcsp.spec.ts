/**
 * End-to-end: create a new client from a PCSP via the Clients tab.
 *
 * Drives the full flow against STAGING_URL using the e2e auth helper:
 *   Clients → Smart Import → upload PCSP → review → mark ready →
 *   commit → done → verify on the client's Care/Files/Funds tabs.
 *
 * Records findings instead of aborting on the first soft failure.
 * Soft failures are tagged FLAG; hard assertions are tagged HARD.
 *
 * Does NOT change app behavior. Run with:
 *   npx playwright test e2e/clients-new-client-pcsp.spec.ts
 */
import { test, expect, Page, ConsoleMessage, Response } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "sample-pcsp.pdf");

// Ground truth extracted from the PCSP fixture.
const CLIENT = {
  fullName: "Marcus T. Rivera",
  fullNameRegex: /Marcus\s+T\.?\s+Rivera/i,
  medicaid: "1029384756",
  dob: "1998-03-14",
  address: /482\s+Birch\s+Lane/i,
  guardianSelf: true,
  emergencyName: "Elena Rivera",
  codes: ["SLH", "HHS", "DSI"],
};

type Finding = {
  step: string;
  status: "pass" | "fail" | "flag";
  detail: string;
};

const findings: Finding[] = [];
const consoleErrors: string[] = [];
const networkErrors: Array<{ url: string; status: number; method: string }> = [];

function record(step: string, status: Finding["status"], detail: string) {
  findings.push({ step, status, detail });
  // Tag in the playwright log too, for live tailing.
  // eslint-disable-next-line no-console
  console.log(`[${status.toUpperCase()}] ${step} — ${detail}`);
}

function hookSignals(page: Page) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter known benign hydration noise from external extensions.
      if (/data-new-gr-c-s-check-loaded|data-gr-ext-installed/i.test(text)) return;
      if (/A tree hydrated but some attributes/i.test(text)) return;
      consoleErrors.push(text);
    }
  });
  page.on("response", (res: Response) => {
    const status = res.status();
    if (status >= 400 && status !== 401) {
      // 401s on initial nav are normal pre-auth; skip.
      networkErrors.push({ url: res.url(), status, method: res.request().method() });
    }
  });
}

test.describe.configure({ mode: "serial" });

test("Clients → Smart Import → finalize a new client from a PCSP", async ({
  page,
}) => {
  test.setTimeout(5 * 60_000); // extraction can take a while
  hookSignals(page);

  // Switch into Admin (Company Admin) portal view if needed — the seeded
  // staging test account is HIVE Exec by default and gets redirected away
  // from /dashboard/clients otherwise.
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const portalTrigger = page
    .locator('label:has-text("Portal View") + button, [aria-label*="Portal View" i]')
    .first();
  if (await portalTrigger.isVisible().catch(() => false)) {
    const current = (await portalTrigger.innerText().catch(() => "")) || "";
    if (!/Admin View/i.test(current)) {
      await portalTrigger.click();
      const adminOpt = page.getByRole("option", { name: /Admin View/i }).first();
      if (await adminOpt.isVisible().catch(() => false)) {
        await adminOpt.click();
        await page.waitForTimeout(800);
        record("Setup: portal view", "pass", `Switched portal to Admin View (was '${current.trim()}').`);
      } else {
        record(
          "Setup: portal view",
          "flag",
          `'Admin View' option not present — the test account may lack Company Admin role.`,
        );
      }
    }
  }

  // ── Step 1 — Clients roster: Marcus must not be there yet ────────────────
  await page.goto("/dashboard/clients", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  if (!/\/dashboard\/clients/.test(page.url())) {
    record(
      "Step 1: roster reachable",
      "fail",
      `Navigating to /dashboard/clients redirected to ${page.url()} — Company Admin role likely missing on the test account.`,
    );
    await reportFindings();
    return;
  }


  const rosterText = await page.locator("body").innerText().catch(() => "");
  if (CLIENT.fullNameRegex.test(rosterText)) {
    record(
      "Step 1: roster pre-state",
      "fail",
      `Marcus already exists in the roster — test cannot prove creation.`,
    );
  } else {
    record("Step 1: roster pre-state", "pass", "Marcus absent before import.");
  }
  // Optional search check
  const search = page.locator('input[placeholder*="Search" i]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(CLIENT.medicaid).catch(() => {});
    await page.waitForTimeout(500);
    const afterSearch = await page.locator("body").innerText().catch(() => "");
    if (CLIENT.fullNameRegex.test(afterSearch)) {
      record(
        "Step 1: search pre-state",
        "flag",
        `Search by Medicaid ${CLIENT.medicaid} already returns Marcus.`,
      );
    }
    await search.fill("").catch(() => {});
  }

  // ── Step 2 — Smart Import: upload PCSP ───────────────────────────────────
  const smartImportLink = page
    .locator('a:has-text("Smart Import"), button:has-text("Smart Import")')
    .first();
  await expect(smartImportLink, "Smart Import entry button missing on Clients").toBeVisible({ timeout: 10_000 });
  await smartImportLink.click();
  await page.waitForURL(/\/dashboard\/smart-import/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // The Smart Import landing may auto-resume a prior in-progress / done job
  // for the same admin. Force a fresh job if the drop zone isn't visible.
  const dropCopy = page.getByText(/Drop PDFs, DOCX, CSV, or Excel files here/i);
  if (!(await dropCopy.isVisible().catch(() => false))) {
    record(
      "Step 2: stale job on entry",
      "flag",
      `Smart Import did not show a fresh drop zone — landed on a prior job. Attempting to start a new one.`,
    );
    const newJobBtn = page
      .getByRole("button", { name: /Import another|Start over|New import|Import more/i })
      .first();
    if (await newJobBtn.isVisible().catch(() => false)) {
      await newJobBtn.click();
      await page.waitForTimeout(1000);
    } else {
      // Fall back: hard-navigate with mode=client to try the index route.
      await page.goto("/dashboard/smart-import?mode=client", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
    }
  }
  await expect(dropCopy).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/Nothing is created in your real records until you review/i),
  ).toBeVisible();


  const fileInput = page.locator("#smart-import-file");
  await fileInput.setInputFiles(FIXTURE);

  const processBtn = page.getByRole("button", { name: /Process with NECTAR/i });
  await expect(processBtn).toBeEnabled({ timeout: 5_000 });
  await processBtn.click();

  // Extraction can take 30-120s. Wait for the "Review placement" button.
  const reviewBtn = page.getByRole("button", { name: /Review placement/i });
  try {
    await expect(reviewBtn).toBeVisible({ timeout: 180_000 });
    record(
      "Step 2: extraction",
      "pass",
      "Upload + extraction completed; status reached in_review.",
    );
  } catch (e) {
    record(
      "Step 2: extraction",
      "fail",
      `Extraction did not reach in_review within 180s: ${(e as Error).message}`,
    );
    throw e;
  }

  // Subject-count check from the summary copy.
  const summaryText = await page.locator("body").innerText();
  const peopleMatch = summaryText.match(/found\s+(\d+)\s+(?:person|people)/i);
  const subjectCount = peopleMatch ? Number(peopleMatch[1]) : NaN;
  if (subjectCount === 1) {
    record("Step 2: subject count", "pass", "Exactly 1 client subject created.");
  } else {
    record(
      "Step 2: subject count",
      "fail",
      `Expected 1 subject, summary reported ${subjectCount}.`,
    );
  }

  await reviewBtn.click();
  await page.waitForURL(/\/dashboard\/smart-import\/[^/]+\/review/, {
    timeout: 15_000,
  });

  // ── Step 3 — Review panel ────────────────────────────────────────────────
  await expect(
    page.getByText(/Advisory throughout — flags surface to act on, never block/i),
  ).toBeVisible({ timeout: 15_000 });

  // Find Marcus in the subject list and select him.
  const subjectEntry = page.getByText(CLIENT.fullNameRegex).first();
  if (await subjectEntry.isVisible().catch(() => false)) {
    await subjectEntry.click().catch(() => {});
    await page.waitForTimeout(500);
  } else {
    record(
      "Step 3: subject visible",
      "fail",
      `Marcus does not appear in the review subject list.`,
    );
  }

  const reviewBody = await page.locator("body").innerText();

  // Spot-check extracted values
  const extractionFlags: string[] = [];
  if (!CLIENT.fullNameRegex.test(reviewBody)) extractionFlags.push("name missing");
  if (!reviewBody.includes(CLIENT.medicaid)) extractionFlags.push(`Medicaid ${CLIENT.medicaid} missing`);
  if (!reviewBody.includes(CLIENT.dob)) extractionFlags.push(`DOB ${CLIENT.dob} missing`);
  if (!CLIENT.address.test(reviewBody)) extractionFlags.push("address missing");
  for (const c of CLIENT.codes) {
    if (!new RegExp(`\\b${c}\\b`).test(reviewBody)) extractionFlags.push(`code ${c} missing`);
  }
  if (extractionFlags.length === 0) {
    record("Step 3: extracted fields", "pass", "Name, Medicaid, DOB, address, SLH/HHS/DSI all rendered.");
  } else {
    record("Step 3: extracted fields", "flag", extractionFlags.join("; "));
  }

  // False "first name/last name missing" check
  if (/first name.+missing/i.test(reviewBody) || /last name.+missing/i.test(reviewBody)) {
    record(
      "Step 3: name-validation false-positive",
      "flag",
      `A first/last name 'missing' message appears even though the name is rendered.`,
    );
  }

  // Guardian contradiction (KNOWN RISK)
  if (/own guardian.+guardian name|guardian_self_vs_named|Pick one/i.test(reviewBody)) {
    record(
      "Step 3: guardian contradiction",
      "flag",
      `'Own guardian + guardian name' contradiction surfaced in the review panel.`,
    );
  }

  // Capture any toast errors as we click Mark ready.
  page.on("console", (msg) => {
    if (/Guardian phone is required/i.test(msg.text())) {
      record(
        "Step 4: guardian trigger",
        "flag",
        `'Guardian phone is required when the client is not their own guardian' surfaced — is_own_guardian likely false.`,
      );
    }
  });

  const markReadyBtn = page.getByRole("button", { name: /Mark ready/i }).first();
  const reopenBtn = page.getByRole("button", { name: /^Reopen$/i }).first();

  if (await markReadyBtn.isVisible().catch(() => false)) {
    await markReadyBtn.click();
    // Wait for either a success toast or an error toast.
    await page.waitForTimeout(2500);
    const toastText = await page.locator('[data-sonner-toast], .sonner-toast, [role="status"]').allInnerTexts().catch(() => []);
    const allToasts = toastText.join(" | ");
    if (/Guardian phone is required/i.test(allToasts)) {
      record(
        "Step 4: guardian trigger",
        "flag",
        `Toast: 'Guardian phone is required…' — is_own_guardian did not propagate.`,
      );
    }
    const stillNotReopened = !(await reopenBtn.isVisible().catch(() => false));
    if (stillNotReopened) {
      record(
        "Step 3: mark ready",
        "flag",
        `Mark ready clicked but the button did not flip to 'Reopen'. Toasts: ${allToasts || "(none captured)"}`,
      );
    } else {
      record("Step 3: mark ready", "pass", "Marcus marked ready.");
    }
  } else if (await reopenBtn.isVisible().catch(() => false)) {
    record("Step 3: mark ready", "pass", "Subject already ready.");
  } else {
    record(
      "Step 3: mark ready",
      "fail",
      `Neither 'Mark ready' nor 'Reopen' button is visible for Marcus.`,
    );
  }

  // ── Step 5 — Submit / commit ─────────────────────────────────────────────
  const commitBtn = page
    .getByRole("button", { name: /Complete client setup|Submit for setup/i })
    .first();
  await expect(commitBtn, "Commit button missing on review page").toBeVisible();

  const isDisabled = await commitBtn.isDisabled().catch(() => true);
  if (isDisabled) {
    record(
      "Step 5: commit gate",
      "fail",
      `Commit button is disabled after marking Marcus ready (ready >= 1 expected).`,
    );
  } else {
    await commitBtn.click();
    // Wait for either navigation to the done page or an error toast.
    try {
      await page.waitForURL(/\/dashboard\/smart-import\/[^/]+\/done/, {
        timeout: 60_000,
      });
      record("Step 5: commit", "pass", "Navigated to the done page after commit.");
    } catch (e) {
      record(
        "Step 5: commit",
        "fail",
        `Did not navigate to /done within 60s — likely commit_failed / Retry commit state. ${(e as Error).message}`,
      );
    }
  }

  // Done page assertions
  if (/\/done$/.test(page.url())) {
    const doneBody = await page.locator("body").innerText();
    if (/Records committed/i.test(doneBody)) {
      record("Step 5: done header", "pass", "'Records committed' header visible.");
    } else {
      record("Step 5: done header", "fail", `Expected 'Records committed' on done page. Got: ${doneBody.slice(0, 200)}`);
    }
    if (/Retry commit|commit failed|not committed/i.test(doneBody)) {
      record("Step 5: commit state", "fail", "Done page shows Retry/commit-failed/not-committed text.");
    }
    // Jargon sweep
    const jargon = ["0/0 requirements met", "skipped by admin"];
    const seen = jargon.filter((j) => doneBody.includes(j));
    if (seen.length) {
      record("Step 5: jargon", "flag", `Internal jargon surfaced: ${seen.join(", ")}.`);
    }
    if (!/Open clients|Review pending clients/i.test(doneBody)) {
      record(
        "Step 5: navigation back",
        "flag",
        `Done page does not offer an 'Open clients' / 'Review pending clients' button.`,
      );
    }
  }

  // ── Step 6 — Roster after commit ─────────────────────────────────────────
  await page.goto("/dashboard/clients", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);

  const search2 = page.locator('input[placeholder*="Search" i]').first();
  if (await search2.isVisible().catch(() => false)) {
    await search2.fill("Rivera").catch(() => {});
    await page.waitForTimeout(500);
  }
  const rosterAfter = await page.locator("body").innerText();
  const present = CLIENT.fullNameRegex.test(rosterAfter);
  const medicaidPresent = rosterAfter.includes(CLIENT.medicaid);
  if (present) {
    record(
      "Step 6: roster after commit",
      medicaidPresent ? "pass" : "flag",
      medicaidPresent
        ? `Marcus visible in roster with Medicaid ${CLIENT.medicaid}.`
        : `Marcus visible but Medicaid ${CLIENT.medicaid} not shown in the row.`,
    );
  } else {
    record("Step 6: roster after commit", "fail", "Marcus did not appear in the Active roster.");
  }

  // Click into Marcus to access Care/Files/Funds tabs.
  const marcusLink = page.getByRole("link", { name: CLIENT.fullNameRegex }).first();
  const marcusRow = page.getByText(CLIENT.fullNameRegex).first();
  if (await marcusLink.isVisible().catch(() => false)) {
    await marcusLink.click();
  } else if (await marcusRow.isVisible().catch(() => false)) {
    await marcusRow.click();
  } else {
    record(
      "Step 7-9: cannot open client",
      "fail",
      `Could not locate a clickable Marcus row to open the client detail page.`,
    );
    await reportFindings();
    return;
  }

  await page.waitForURL(/\/dashboard\/clients\/[0-9a-f-]+/i, { timeout: 15_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // ── Step 7 — Care tab ────────────────────────────────────────────────────
  const careTab = page.getByRole("tab", { name: /^care$/i }).first();
  if (await careTab.isVisible().catch(() => false)) {
    await careTab.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  const careBody = await page.locator("body").innerText();

  const pcspGoalsPresent =
    /community integration/i.test(careBody) ||
    /daily living/i.test(careBody) ||
    /health/i.test(careBody);
  if (pcspGoalsPresent) {
    record("Step 7: PCSP goals on Care", "pass", "At least one PCSP goal rendered on the Care tab.");
  } else {
    record(
      "Step 7: PCSP goals on Care",
      "flag",
      `None of the three PCSP goals (community integration / daily living / health) were found on Care.`,
    );
  }

  const gatedBanner = /Upload a PCSP to get started/i.test(careBody);
  if (gatedBanner) {
    record(
      "Step 7: PCSP-derived cards gated",
      "flag",
      `Support strategies / training / Person-Centered cards show 'Upload a PCSP to get started' even though a PCSP was imported (goals present, hasPcsp false).`,
    );
  }

  // ── Step 8 — Files tab ───────────────────────────────────────────────────
  const filesTab = page.getByRole("tab", { name: /^files$/i }).first();
  if (await filesTab.isVisible().catch(() => false)) {
    await filesTab.click();
    await page.waitForTimeout(800);
    const filesBody = await page.locator("body").innerText();
    if (/sample-pcsp\.pdf|PCSP/i.test(filesBody) && /pcsp/i.test(filesBody)) {
      // Heuristic: any row mentioning 'PCSP' as a document type
      if (/\bPCSP\b/.test(filesBody) && /Uploaded|\.pdf/i.test(filesBody)) {
        record("Step 8: PCSP in Files", "pass", "A PCSP document appears in the Files tab.");
      } else {
        record(
          "Step 8: PCSP in Files",
          "flag",
          `Files tab does not surface the uploaded PCSP — known gap: import did not copy PCSP into client_documents.`,
        );
      }
    } else {
      record(
        "Step 8: PCSP in Files",
        "flag",
        `Files tab does not show the PCSP that was uploaded during Smart Import.`,
      );
    }
  } else {
    record("Step 8: Files tab", "flag", "Files tab not found on client detail page.");
  }

  // ── Step 9 — Funds tab ───────────────────────────────────────────────────
  const fundsTab = page.getByRole("tab", { name: /^funds$/i }).first();
  if (await fundsTab.isVisible().catch(() => false)) {
    await fundsTab.click();
    await page.waitForTimeout(1000);
    const fundsBody = await page.locator("body").innerText();
    const missing = CLIENT.codes.filter((c) => !new RegExp(`\\b${c}\\b`).test(fundsBody));
    if (missing.length === 0) {
      record("Step 9: codes on Funds", "pass", `SLH, HHS, DSI all present.`);
    } else {
      record(
        "Step 9: codes on Funds",
        "fail",
        `Missing codes on Funds tab: ${missing.join(", ")}.`,
      );
    }
    // Duplicate / malformed sniff
    for (const c of CLIENT.codes) {
      const occurrences = (fundsBody.match(new RegExp(`\\b${c}\\b`, "g")) || []).length;
      if (occurrences > 3) {
        record(
          "Step 9: code duplication",
          "flag",
          `Code ${c} appears ${occurrences} times on the Funds tab — possible duplicate authorizations.`,
        );
      }
    }
  } else {
    record("Step 9: Funds tab", "flag", "Funds tab not found on client detail page.");
  }

  await reportFindings();
});

async function reportFindings() {
  // eslint-disable-next-line no-console
  console.log("\n\n================ FINDINGS ================");
  for (const f of findings) {
    // eslint-disable-next-line no-console
    console.log(`[${f.status.toUpperCase()}] ${f.step}: ${f.detail}`);
  }
  // eslint-disable-next-line no-console
  console.log("\n--- Console errors ---");
  for (const e of consoleErrors) console.log(e);
  // eslint-disable-next-line no-console
  console.log("\n--- Network >= 400 ---");
  for (const n of networkErrors) console.log(`${n.status} ${n.method} ${n.url}`);
  // eslint-disable-next-line no-console
  console.log("==========================================\n");

  // Surface hard failures as test failures.
  const hard = findings.filter((f) => f.status === "fail");
  if (hard.length) {
    throw new Error(
      `HARD assertions failed:\n${hard
        .map((f) => `- ${f.step}: ${f.detail}`)
        .join("\n")}`,
    );
  }
}
