# Session Report — Claude Code work order (2026-06-11)

Branch: `claude/busy-cray-w323d6` · all commits typecheck + build green.
Tasks 0–8 complete, merged to `main`. SQL handoffs pending (see below).

> **Post-review revision (`c56875e`):** the six new service-code display labels
> were corrected per owner (CMP/CMS are Caregiver Compensation — Supported
> Living Natural, not companion services; SJP/SJR are placement/retention
> milestones; ELS = Extended Living Supports), and the SQL handoff was revised —
> `home_designations` is NOT legacy and is no longer deleted; a conditional
> repair section re-seeds its four care-team labels if an earlier cleanup
> removed them.

## Commits (oldest → newest)

| Commit | What it does |
|---|---|
| `982d504` Task 0 | CLAUDE.md project brain at repo root |
| `5f9070e` Task 1 | EVV registry (evvLock=true for exactly ACA, CHA, COM, HSQ, PAC, RP2, RP3, SLH, SLN, CMP, CMS; SEI/RHS/RL6/LPS now non-EVV; +CMP, CMS, ELS, SJD, SJP, SJR), daily codes = {HHS, RHS, PPS, DSG, RL6, RP4, RP5, SED}, `computeEntryUnits()`, stale local daily-code copies repointed |
| `753ee5c` fix | smart-import page read search params from the parent route (latent type error) |
| `62e296b` Task 2 | lifecycle cross-org guard, must_change_password enforced at router root, /fix-admin deleted, certificate page → `verify_certificate` RPC, PHI console logging removed |
| `fbf2ea5` fix | all organization_members↔profiles (and evv_timesheets→profiles) embeds replaced with two queries joined in JS — these failed live (no FK): CE roster, behaviorist picker, swap partners, NECTAR people search, company-overview celebrations, client staff-assignment tab, command-center timesheet queues + open-shifts panel |
| `765c9cc` Task 3 | nine daily-rate readers now read `hhs_daily_records_v`, billable=true only; "N blocked days" chips (Billing Overview + staff pay-period card) with record_date + blocked_reason tooltips |
| `1d75466` Task 4 | per-entry quarter-hour math everywhere (accrual.ts + inline loops), `billed_units` written on all four clock-out paths, amber "no worksheet rate on file" badge, Form 520 remaining = full-authorization-window consumption |
| `de1559d` Task 5 | read-only `/dashboard/settings/service-codes` registry, grouped by category, linked from Settings |
| `c25d158` Task 6 | teams→locations sync on home create/edit, eligibility host lookup fixed, SQL handoff written |
| `72457cf` Task 7 | strict-inequality PTO checks; new `coverage-count.ts` — segments subtract their staff from home coverage; both coverage surfaces use it |
| `83cd31d` Task 8 | scheduler visual layer (micro coverage bars, host-home dots + DS meter, 1:1 target meters, redesigned shift cards, horizontal drag-and-drop day timeline) |

## SQL handoffs pending (docs/SQL_HANDOFF.md)

1. **Locations cleanup** — run block 1b (verify) first; if it already returns
   exactly `Maple House [residential]` skip 1a. Otherwise run 1a then 1b.
   `home_designations` is untouched by the cleanup.
2. **Care-team designations repair (conditional)** — run the 2a count check;
   only if it returns 0 (an earlier cleanup version deleted the rows), run 2b
   to re-seed House Manager / Lead / Supervisor / DSP for every org.
3. **ELS rename** — one-line update so the live `service_codes` name matches
   the corrected "Extended Living Supports" label.

## Things for you to double-check

- **Variable-rate codes** now = HHS, RHS, DSI, SEI (was DSI, SEI) per the
  CLAUDE.md worksheet-rate rule — drives the amber "no worksheet rate" badge.
- The work order said the bs-config-card embed was already fixed; on this
  branch's base it wasn't, so I fixed it (and every other instance) here.

## Click-by-click verification checklist

**Auth & security**
1. Settings → set a test user's `must_change_password` (or invite flow) → log in as them → every URL (deep link too) should bounce to /reset-password until the password is changed.
2. Visit `/fix-admin` → 404.
3. Open a certificate link `/certificate/<code>` logged OUT → certificate renders (now via RPC).
4. As an admin: archive + delete a test employee in your own org → still works.

**Broken-list fixes (embed repairs — these were empty before)**
5. Settings → CE hours roster: staff now listed.
6. Client → Behavior Support card: behaviorist dropdown now has people.
7. Command Center: Pending/Approved/Rejected EVV tabs show staff names; ">16h open shifts" panel populates.
8. NECTAR search bar: searching a staff name returns them.

**Billing (Tasks 3–4)**
9. Billing Overview: muted "N blocked days" chip appears when a daily record is non-billable; hover lists date + reason. Daily "Used" only counts billable days.
10. Staff (host-home) pay card: Host Home line counts only billable days; blocked days listed under the subtotal.
11. Clock in/out on any code → the new evv_timesheets row has `billed_units` = duration rounded to nearest 15 min (check via SQL or admin).
12. Form 520: Remaining column shows "used / authorized" subtitle and reflects the WHOLE authorization window even when viewing one month.
13. Client billing page → a code card for HHS/RHS/DSI/SEI with rate 0 shows the amber "no worksheet rate on file" badge instead of $0.

**Service-code registry (Task 5)**
14. Settings → "Service Code Registry" card (admin or manager) → table grouped by category with EVV Yes/No, rate source, default rate, cadence, caps, asleep-billable; search filters it.

**Locations (Task 6, after SQL handoff)**
15. Scheduler → Locations: only real homes (Maple House), no role names.
16. Homes & Teams → add a test home → it appears in Scheduler → Locations with the right type; rename it → location renames.

**Scheduler (Tasks 7–8)**
17. All homes view: residential rows show per-day 24h micro bars (red stripes only where staffing < coverage rules; green stripes where above). Host-home rows show 3 dots/day + weekly DS meter; never red.
18. Create two back-to-back shifts (one ends 15:00, next starts 15:00, same staff) → NO overlap conflict.
19. Add a 1:1 segment (DSI) inside a base shift → no conflict; try a daily code or times outside the parent → blocked/hard conflict.
20. With a 1-staff coverage requirement and a segment running, the coverage bar should show a red gap during the segment window (staff excluded from count).
21. Shift cards: code chip colored by family, "Staff → Client" names, time + duration badge, dashed border on drafts, red border when conflicted, sparkle on NECTAR-created shifts.
22. Click a day cell → bottom drawer: horizontal 24h axis, staff swimlanes, required band (red stripes where uncovered). Drag a block sideways → snaps to 15 min and saves; tap a block → editor opens. Check on a phone (375px): timeline scrolls sideways.

## Task 7 code-review notes (no test runner in repo, so logic verified by review)

- `overlaps()` in conflicts.ts uses strict `<` both sides → end==start is not an overlap (a).
- Segment↔parent pairs skip `staff_overlap`; rest-rule also skips the pair (b).
- `daily_on_segment` + `segment_outside_parent` are hard conflicts in the engine AND rejected at write time in `createShift` (c).
- New `coverage-count.ts`: base shifts +1, segments −1 (only when their parent is in the set and same staff), clamped ≥0; both CoverageBar24h and the day drawer consume it (d).
- PTO checks (engine + editor advisory) switched to strict inequality for consistency with (a).
- Swap-partner, auto-assign, eligibility overlap math already strict — verified, untouched.

---

# Mobile experience pass (2026-06-11, branch `claude/mobile-pass`)

Presentation/navigation only — no business logic, queries, or desktop (md+)
layouts changed. Commits: `fc9d77c` dialogs→bottom sheets · `fa6d40c` scheduler
mobile Day view · `9f04397` staff agenda polish · `e3bf631` global hygiene ·
`574dd33` PWA.

## Phone verification checklist (test at 375px / a real phone)

**Admin scheduler (`/dashboard/schedule-preview`)**
1. On a phone you see the Day view: date strip + location chips + cards — the desktop week grid (and its crushed SUN/MON/TUE header) never appears. On a desktop/tablet ≥768px the old board is pixel-identical.
2. Swipe the date strip sideways; today has an amber dot; tapping a day loads that day (tapping into next week refetches that week).
3. Location chips (All / Maple House / 1-on-1) filter the cards; host homes are tagged "· host".
4. "Needs your approval" sits near the top — approving/denying a time-off or swap request is one tap. Open shifts (when any exist) show one-tap Approve/Deny for claims.
5. Coverage strip: Maple House shows the mini 24h bar (red stripes where staffing is below the rules); a host home shows the three status dots; tapping a row opens the day timeline.
6. Each shift card shows code chip (family color), Staff → Client first names, time + duration badge, and a status chip; drafts have dashed borders; conflicts a red border. Tapping a card opens the editor as a BOTTOM SHEET, not a centered modal.
7. Tap the floating + → the client → code → time → staff stepper runs full-screen per step; Start/End pickers are stacked; Back/Next are full-width thumb buttons; finish creating a shift end-to-end on the phone.
8. Nothing scrolls horizontally at 375px except the date strip / chip rows.

**Staff agenda (`/dashboard/schedule`, staff view)**
9. Today's agenda loads first; "Open shifts you're qualified for" appears at the top when one exists (Claim is one tap).
10. A pending shift card shows full-width Accept / Decline thumb buttons (48px); accepting works; tapping an accepted hourly shift deep-links into the client's clock-in tab.
11. No horizontal scroll anywhere on the page at 375px.

**Global hygiene**
12. Open any dialog on a phone (e.g. Request time off, shift editor) → it slides up as a bottom sheet with a 44px close target; on desktop it's still the centered modal.
13. Billing Overview, 520 grid, Service Code Registry, Service Catalog: tables scroll sideways inside their container and the first column stays pinned while you scroll.
14. Admin header on a phone: tap the amber search icon → the NECTAR ask bar expands full-width on a navy strip; search works; tap again to collapse.
15. Hamburger menu opens the sidebar sheet; tapping a nav link navigates AND closes it.

**PWA**
16. Visit the deployed app in mobile Chrome/Safari → "Add to Home Screen" offers "Hive" with the hex icon.
17. Launch from the home screen → opens standalone (no browser chrome), navy splash, and stays standalone through login.
18. Airplane mode → relaunch: the shell still opens (offline fallback). Data needs a connection — by design nothing from the API/PHI is ever cached (verify in DevTools → Application → Cache Storage: only `hive-shell-v1` / `hive-assets-v1` with HTML, icons, and /assets/* files).

---

# HHS clarity pass (2026-06-11, branch `claude/hhs-clarity`)

Presentation, naming, and one new read-model — billing math, conflict logic,
and EVV behavior untouched (the daily attendance writer in `hhs.functions.ts`
was not modified; the roll-up reads via a new `hhs-certifications.functions.ts`).
Commits: `124eb43` HHS vocabulary + ⓘ · `1ac88a5` visit/row labels ·
`a3b93e1` code-step ⓘ + explainer banner · `132045a` shift-detail hours note ·
`e0162f8` hide host homes by default · `447066c` Monthly Attendance + certify.

## SQL handoffs added (docs/SQL_HANDOFF.md)

- **§4 `user_ui_dismissals`** — per-user banner dismissal persistence. Before
  it runs, dismissing the explainer only lasts the session (no crash).
- **§5 `hhs_monthly_certifications`** — month-end sign-off. Before it runs,
  "Certify month" is disabled with a "Pending database update" tooltip.

One judgment call: the work order says "an admin or the assigned program
lead" certifies — no program-lead concept exists in the schema, so the gate
is admin/manager (`requireOrgMembership(…, "manager")` + matching RLS).

## Verification checklist

**Labels & tooltips (Task 1)**
1. Scheduler → a shift with code HHS shows "HHS Support Visit · <client first name>" (desktop chip) / "HHS Support Visit · <staff>" (mobile card) — never bare "HHS". A respite-code shift at a host home reads "HHS Respite".
2. Each HHS visit card has an ⓘ (hover on desktop / long-press title on mobile) explaining the host family never clocks in.
3. Host-home location pills, all-homes rows, mobile chips, and coverage rows read "<Client first name + last initial> — Host Home (HHS)" (e.g. "Jane D. — Host Home (HHS)").
4. + New shift → pick the HHS client → code step shows the ⓘ + purpose hint; the HHS tile is captioned "HHS Support Visit", respite tiles "HHS Respite".
5. Staff agenda: an assigned HHS visit card shows the host-home label line and the ⓘ beside the client name.
6. Open an HHS visit's shift detail (staff): badge reads "HHS Support Visit"; a blue note reads "Counts toward <Client>'s required ≈ N support hrs/month (worksheet)" when a weekly HHS target exists (weekly ×4.33), else "Support hours target not set — ask your admin."
7. Explainer banner: first visit to the scheduler (with host homes) or staff agenda (with an HHS visit) shows the amber "How host homes (HHS) work" banner. Dismiss it → it stays gone on both surfaces. Pre-§4 SQL it returns after a reload; post-§4 it stays dismissed across reloads/devices.

**Host homes hidden by default (Task 2)**
8. Scheduler with NO visits scheduled this week: the host home appears in neither the pills/chips, the all-homes rows, nor the coverage strip. Staff agenda still shows assigned visits.
9. Toggle "Show host homes" (desktop controls bar / dashed chip in the mobile chip row) → host home appears; the preference survives a reload (persisted with the other scheduler settings); default is off.
10. With the toggle off, schedule an agency visit at the host home this week → the home appears for that week automatically (and its status-dots row returns to the all-locations view).

**Monthly Attendance (Task 3)**
11. HHS hub → new "Monthly" tab: month grid shows green Present days (✓), amber Away days, red dots on unbillable days, grey no-entry days; the four count tiles match the seeded attendance, and unbillable days list their blocked_reason (from hhs_daily_records_v).
12. ‹ › navigation works; future months are blocked; past uncertified months show the amber "Needs certification" chip.
13. BEFORE running §5: "Certify month" is disabled and shows "Pending database update" on hover; the tab renders without errors.
14. AFTER running §5: as admin/manager, "Certify month" works — the tab then shows "Certified by <name> on <date> · N present / N away / N unbillable", and re-loading shows the same. As plain staff the button is replaced by "Admin / manager signs off."
