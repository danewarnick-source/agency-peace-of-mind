## Plan — Seed a fully built-out fake HHS+DSI client for Summary Automator testing

### Scope
Add ONE clearly-fake test client to True North Supports LLC with a complete quarter of approved documentation, then ensure a quarterly progress summary row exists so it shows up in the Summaries page ready to draft.

This is a **data-only seed** (insert tool, no schema change, no app code change). Everything is namespaced so it is trivial to find and delete later.

### Target quarter
Most recently completed calendar quarter relative to today (2026-06-14) → **2026 Q1 (Jan 1 – Mar 31, 2026)**.

### What gets inserted

1. **Client** — `clients`
   - Name: `ZZ TEST — Jordan Sample` (sorts to bottom, obviously fake)
   - DOB, fake Medicaid ID (`TEST000000`), phone, address (Salt Lake City placeholder)
   - `authorized_dspd_codes`: `{HHS, DSI}`
   - `pcsp_goals` (4 specific goals):
     1. Increase independence with the morning hygiene routine.
     2. Build community connections through a weekly social activity.
     3. Improve safe money-handling skills during community outings.
     4. Expand verbal communication in group settings.
   - `account_status = active`, `intake_status = complete`

2. **Authorizations** — `client_billing_codes` (2 rows)
   - HHS: daily rate, worksheet rate ~$95/day, annual auth covering quarter.
   - DSI: 15-min units, rate ~$5.50/unit, weekly cap, service dates spanning quarter.

3. **Approved HHS daily logs** — `daily_logs` (~75 rows, ~25/month across Jan/Feb/Mar 2026)
   - `status = approved`, `approved_at` set, `approved_by` = an existing admin user in the org.
   - `user_id` = an existing TNS staff profile (picked at insert time).
   - Varied narratives written in DSP voice (host-home morning routine, meals, evening wind-down, weekend outings, a doctor visit, a community event, a goal milestone, routine days).
   - `pcsp_goals_addressed` tags 1–2 of the 4 goals per note, rotated so every goal accumulates evidence across the quarter.

4. **Approved DSI day-service logs** — `daily_logs` (~30 rows, ~10/month, weekdays)
   - Same table (drafter pulls all approved daily_logs in period; service is implied by narrative + goal tag).
   - Narratives describe day-service activities: community access trips, library/coffee shop visits, money-handling practice at the register, group-setting communication practice, skill-building sessions.
   - Goal tagging emphasizes goals 2, 3, 4 (community / money / communication).

5. **Shift reports** — `shift_reports` (~6 rows spread across quarter, `submitted_at` set)
   - Short shift-level narratives that add texture for the drafter.

6. **Incident reports** — `incident_reports` (2 minor, appropriate)
   - One minor (e.g. a stubbed toe during a community outing, first aid only).
   - One behavioral (e.g. brief verbal escalation in a group setting, de-escalated; ties to goal #4).
   - `status = approved/submitted`, dates inside quarter, narratives clinical and non-harmful.

7. **Summary row** — `client_progress_summaries`
   - Insert pending row for `2026-Q1`, kind `quarterly`, services `{HHS, DSI}`, `include_goal_progress = true`, status `pending`, due 2026-04-15.
   - This makes the client appear immediately in the Summaries page; clicking "Draft with Nectar" will call `draftProgressSummary` which finds the seeded approved logs/reports/incidents and produces a real 6-section draft.

### How testing works after seed
1. Open `/dashboard/summaries` → row for `ZZ TEST — Jordan Sample · 2026-Q1` appears as **Pending**.
2. Click **Draft with Nectar** → Nectar reads the ~105 approved daily logs + 6 shift reports + 2 incidents + 4 PCSP goals and writes the full PERSON / SERVICES / DATE RANGE / GENERAL SUMMARY / GOAL PROGRESS prose.
3. Edit in the side-by-side dialog, finalize, download PDF.

### Cleanup story
All seed rows are reachable from the client row. `DELETE FROM clients WHERE first_name = 'ZZ TEST — Jordan' AND organization_id = '<TNS>'` cascades to billing codes / daily logs / incidents / summaries. I will note this in the closing message.

### Out of scope (explicitly NOT touching)
- No schema changes, no migrations.
- No changes to real clients, billing math, EVV, host-home certification logic, or Summary Automator code.
- No fake host-home/HHP cue card record — host home placement UI isn't required for the summary draft to work, and the request is to test the **Summary Automator**, not the host-home certification flow.

### Technical details
- All inserts go through the `supabase--insert` data tool in 2–3 SQL batches (client+auths first to get the id; then logs/reports/incidents in bulk using a CTE that re-selects the test client id; finally the summary row).
- `user_id` for logs picked via subquery: first `organization_members` row in TNS with role in (`admin`,`manager`,`staff`).
- `approved_by` picked the same way (admin/manager).
- Narratives are inlined arrays in SQL — no script needed, no app-side code path involved.
