# HIVE — Project Brain (read me first)
HIVE is a multi-tenant compliance platform for Utah DSPD (disability services) providers, replacing Connecteam + manual compliance. AI engine = "Nectar" (AWS Bedrock; Nectar advises/flags, NEVER fabricates documentation or acts unreviewed). First tenant: True North Supports (TNS). Services TNS runs: HHS, SLN, SLH, SEI, DSI. Launch: 2026-07-01, same day the new state contract DHHS91172 takes effect.

## Architecture & workflow
- TanStack Start + React + Supabase (LOVABLE CLOUD: no service keys, no direct DB access — all SQL goes to the human via docs/SQL_HANDOFF.md). Lovable.dev co-edits this repo via GitHub sync: small atomic commits, build green before push, one writer at a time.
- supabase/migrations/ may NOT match the live DB. Confirm schema via SQL handoff queries before relying on it.
- NEVER PostgREST-embed organization_members↔profiles (no FK; both key off auth.users.id) — two queries, join in JS.
- RLS: every org-data table is org-scoped via is_org_member/is_org_admin_or_manager helpers; never USING(true) on org/PHI data. `teams` = homes (team_name/setting/address). `home_designations` holds the Homes & Teams CARE-TEAM role labels (DSP/House Manager/Lead/Supervisor) — that's its legitimate data; never delete it, and never treat its rows as locations/homes.

## DSPD domain rules (encoded product truths — do not "simplify" these away)
- Atomic shift = client + service code + staff + time window. A client may only be scheduled/billed for codes with an active authorization row in client_billing_codes (the "1056"). No authorization → no shift, no billing.
- Unit math: quarter-hour codes round each ENTRY to the NEAREST quarter hour (Math.round of duration/15min); never alter raw timestamps; aggregate by summing per-entry units (never round a summed total). computeEntryUnits() in src/lib/billing-units.ts is the only correct path.
- EVV-mandated codes (geofence + UEVV transmission) per SOW §1.12: COM, HSQ, PAC, ACA, CHA, RP2, RP3, SLH, SLN, CMP, CMS. Everything else (incl. SEI, RHS, HHS, DSI) captures time for payroll/evidence only. src/lib/evv-codes.ts is authoritative.
- Daily-rate codes: HHS, RHS, PPS, DSG, RL6, RP4, RP5, SED (src/lib/service-billing.ts). HHS/RHS/DSI/SEI rates are per-client "worksheet" rates from client_billing_codes.rate_per_unit; SLH/SLN are table rates.
- Residential model: RHS = staffed homes, coverage requirements + coverage bars; staff clock for payroll (not EVV) and may run nested 1:1 segments (DSI/SEI) inside a base shift via parent_shift_id — segments are NOT overlap conflicts; during a segment the staff doesn't count toward home coverage. HHS = host homes: hosts NEVER clock or appear in shift scheduling; their artifact is the daily note + overnight confirmation (billing trigger: no overnight stay = unbillable day); agency staff visits into host homes ARE timed shifts (worksheet Direct Support hours).
- A billable HHS/residential day = attendance 'Present' AND daily note exists → hhs_daily_records_v.billable; otherwise blocked_reason explains.
- Summary cadences (DHHS91172, eff 7/1/26): quarterly (due 15 days after quarter end) for most codes incl. HHS/RHS/DSI/SLH/SLN; MONTHLY for SEI, SJD, CMP, CMS, PN1/PN2 (SEI summaries are typed into the state's UPI portal by the 15th); PBA = monthly financial statements. UPI is admin-only; staff never touch it.
- Conflict engine truths: back-to-back shifts (end == next start) are NOT overlaps; segment-within-parent is NOT a conflict; 2:1 staffing (two staff, one client, same time) needs a rights-modification warning; SLH/SLN overnight needs awake confirmation (asleep time unbillable); DSI max 6h/day; CMP/CMS max 8h/day, 40h/wk.
- Nectar posture: Gatekeeper (note coaching), Scrubber (pre-billing), Sentinel (deadlines/counters), Auditor (packet assembly). Always advisory: drafts marked, human attests, never auto-publish, never invent content.

## Known landmines
- locations table exists live-only; was polluted with staff-role names; rebuild only from teams.
- Old hhs_daily_records table is orphaned; read hhs_daily_records_v instead (never delete the old table without instruction).
- must_change_password must be enforced at router root. /fix-admin route is deleted; never recreate.
- The human runs SQL in Lovable's editor and must Clear it before each paste; write handoff SQL truncation-proof (string_agg for lists).

# Build & commit rules for this repo

This project uses TanStack Router (via @lovable.dev/vite-tanstack-config). The
file src/routeTree.gen.ts is auto-generated AND committed to git. If it is stale
relative to the route files, the Lovable preview fails to build ("Preview has
not been built yet").

## Required before EVERY commit and push:
1. Run `npm run build`. This regenerates src/routeTree.gen.ts via the
   tanstack router plugin.
2. If src/routeTree.gen.ts changed, stage it together with your other changes.
3. Never commit changes to files under src/routes/ without the matching
   regenerated src/routeTree.gen.ts in the same commit.
4. The build must pass before you push.
