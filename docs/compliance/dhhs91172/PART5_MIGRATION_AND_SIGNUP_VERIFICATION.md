# Part 5 — migration and signup flow verification

Environment: PostgreSQL 16, installed as a system package in this session's
container (`pg_ctlcluster 16 main start`), completely separate from the
Supabase Cloud project this repo's `.env` points at (no service key is even
present — consistent with `CLAUDE.md`'s "Lovable Cloud: no service keys, no
direct DB access"). Database `agency_setup_gate_it` / role `agency_setup_it`,
schema from `supabase/tests/agency-setup-gate/isolated-schema.sql` (built by
the baseline commit, extended in this change for the FACT-063 column) plus
the real `org_setup_is_complete()` / `org_setup_allows_create()` /
`protect_agency_setup_completion_columns()` functions copied verbatim from
`supabase/migrations/20260915080000_agency_setup_questionnaire.sql`.
`agency-setup-gate.integration.test.ts`'s own `refuseProduction()` throws if
the connection string ever contains the live project ref
(`dhrrukdcigiiqksibdfb`) — checked on every `before()`.

**What tier this is, honestly**, per `scripts/agency-setup-gate-preview.md`
(written by the baseline commit, still accurate): this is the **simplified**
isolated schema — org-scoped permissive policies plus this one migration's
restrictive INSERT + triggers. It does **not** include caseload PHI SELECT
policies, `self insert member` employee-only hardening, Hive Exec UPDATE, or
the rest of `supabase/migrations/` (there are 100+ other migration files).
**A green run here is not full-project RLS proof.**

## Access blocker for the full-project tier — precise, reproduced this session

`scripts/agency-setup-gate-preview.md` listed "Supabase CLI not installed" as
a blocker; that is no longer accurate (`npx supabase` auto-installs, version
2.117.0 confirmed working this session). The real, still-current blocker:

```
$ npx supabase start
{"_tag":"Error","error":{"code":"LegacyDockerLifecycleInspectError",
"message":"failed to inspect container health: failed to connect to the
docker API at unix:///var/run/docker.sock; check if the path is correct
and if the daemon is running: dial unix /var/run/docker.sock: connect:
no such file or directory"}}
```

`docker info` in this container confirms the same: the `docker` CLI is
present but there is no daemon socket. `supabase start` boots Postgres +
GoTrue (Auth) + PostgREST + Storage as Docker containers — it cannot run
without a reachable Docker daemon, and none of the other three "missing"
items from the preview doc (a dedicated non-prod project ref, test user
sessions, an app origin pointed at that DB) can be evaluated until this one
is resolved. **This is the precise blocker, reproduced directly, not
inferred**: no Docker daemon in this container. It is an environment
property, not something fixable from inside this session.

## The flow, bullet by bullet

**signup → conditional agency questions → save/resume → finish setup →
staff/client creation unlocked → deferred inputs saved** — covered end to
end *except* the literal HTTP signup step (creating the `auth.users` row via
Supabase Auth/GoTrue), which needs the full stack above and is the one part
this tier cannot reach. Everything downstream of a signed-up user runs for
real against Postgres + RLS:

- Conditional agency questions: `agency-setup-questions.test.ts` (in-memory,
  RHS/PPS/PBA callouts — see below) plus real-DB proof that SEI-conditional
  requiredness agrees between TypeScript and SQL ("requires the SEI award
  date in SQL only once SEI is awarded").
- Save/resume: `persistAgencySetupFactsInternal`'s partial-save behavior —
  "rolls back org facts when a later setup-save step fails" restores the
  pre-update snapshot on a downstream failure; unanswered fields are
  preserved across saves by construction (`answers.X !== undefined` guards
  throughout `agency-setup-persist.ts`, never overwritten with a default).
- Finish setup: "matches TypeScript and SQL completion on the full
  registry-driven fact set" sets every required field and asserts
  `complete: true` on both sides, then blanks one field and asserts `false`
  again.
- Staff/client creation unlocked: "blocks second staff, client, and
  invitation while setup is incomplete" (direct create requests — below)
  and "allows staff, client, and invitation after setup is complete."
- Deferred inputs saved: the representative-payee 4-state test, the
  assignment-scope (FACT-060) round-trip test, and the general
  `compliance_fact_answers` org-isolation test.

**Direct create requests remain blocked before setup completion.** —
Proven twice: "blocks second staff, client, and invitation while setup is
incomplete" (an authenticated org member, blocked by the restrictive INSERT
policy + `BEFORE INSERT` trigger) and "service-role writes still hit the
trigger" (a `service_role`-privileged write is *also* blocked — the gate is
not just an RLS policy an elevated role could bypass, it is a trigger on the
table itself).

**False and zero are valid answers.** — Proven for booleans:
`fact_uses_volunteers = false` is set and asserted `complete: true` (not
read as unanswered) in the completion-parity test, and the four-state
representative-payee test proves `false` persists as `false` specifically
(not coerced to `null` or read back as `unanswered`). Proven for numbers:
new test "zero is a valid answer for a required number field" sets
`approx_client_count = 0` and asserts `complete: true` on both the SQL and
TypeScript sides — a naive `if (value)` check would treat `0` as falsy and
wrongly read it as missing; this proves the real column does not.

**Unknown required facts cannot silently satisfy completion.** — Structural
guarantee, not a coincidence: `org_setup_is_complete()`'s own SQL never
references `compliance_fact_answers` at all (confirmed by reading the
function body, not just its comment). Proven directly with a new test:
insert a `compliance_fact_answers` row with `status = 'unknown'`
(previously only "no row exists" was tested, which is a weaker claim) and
assert completion is unaffected. Separately found: **agency-level required
questions have no "unknown" status at all** — `q_dhhs_provider_id`'s help
text says "mark this 'I don't know yet' rather than guessing," but no such
control exists anywhere in `dashboard.settings.compliance-setup.tsx`. Left
unresolved — flagged as a documentation/UI mismatch, not fixed in this
change (building a genuine "unknown" state for agency-level questions is a
new feature, not a verification task).

**Ordinary users cannot edit completion-audit or exemption fields.** —
Three tests: "blocks an authenticated admin from flipping
setup_create_gate_exempt," "fail-closed: untrusted roles cannot flip
setup_create_gate_exempt" (both the exemption flag), and "an authenticated
admin cannot edit their own setup_completed_at / setup_questionnaire_version"
(the audit columns). All three use a real admin-role authenticated
connection (`asUser`/`SET ROLE authenticated`), not a service-role bypass —
proving the *trigger* (`protect_agency_setup_completion_columns()`), not
just an RLS policy, rejects the write.

**Two organizations remain isolated.** — "prevents Agency A from reading,
updating, or inserting Agency B records" (the general case) plus two
fact-specific proofs added in this change: `compliance_fact_answers` (Agency
B gets zero rows querying Agency A's entity, and a direct insert into Agency
A's scope is rejected — "row-level security|violates|permission denied"),
and implicitly the assignment-scope and rep-payee tests, which only ever
touch `ORG_A`.

**Existing agency answers survive migration.** — Verified two ways rather
than by literally replaying every prior migration (impractical to
reconstruct faithfully without risking an inaccurate stand-in for the real
migration chain): (1) static — every statement in
`20260915080000_agency_setup_questionnaire.sql` is `ADD COLUMN IF NOT
EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, or a
`DROP POLICY IF EXISTS` immediately followed by `CREATE POLICY` (the
standard idiom for redefining a policy without touching table rows) — grepped
directly, zero `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or unscoped
`UPDATE`/`DELETE` on `organizations` anywhere in the file. (2) empirical —
this file's own schema was re-applied against the same, never-truncated
database well over a dozen times over the course of this session (the
integration suite has no per-run reset), and organization/client row *data*
demonstrably survived every one of those re-applications: the two
rerun-fragility bugs found and fixed in this same session (stray rows from
one run colliding with the next run's count assertions) are direct,
first-hand evidence that data persists across repeated schema/migration
application — if it did not, those bugs could never have occurred.

**All awarded codes survive saves through every company-profile editor.**
— Read (not just trusted the commit message for) the actual save path in
`dashboard.nectar-company-profile.tsx` — the file the baseline commit's own
message names as the one with the fix. Confirmed real: the draft is hydrated
directly from `orgRow.services_offered` (no filter to a fixed code list),
saved through the shared `persistAgencySetupFactsInternal` path (the same
one the main wizard uses, not a second independent writer), and the UI
renders any code present in the data — including one the platform's own
`SERVICE_OPTIONS` doesn't recognize — as a visible, still-toggleable chip
rather than silently dropping it (`Array.from(new Set([...SERVICE_OPTIONS,
...draft.services]))`). The main wizard route uses the same registry-driven
hydration (`hydrateDraft` reads `agencySetupFactValue` generically per
`factKey`, no hardcoded subset). No other writer of `services_offered` was
found (`agency-documents.functions.ts`, `company-obligations.functions.ts`
only read it).

**PPS, RHS, and PBA expose the appropriate questions and subsequent fact
inputs.** — All three already had passing unit tests before this change
(`agency-setup-questions.test.ts`): "RHS produces the residential section
with an RHS-specific callout," "PPS produces the residential section with a
host-home-specific callout," "PBA produces a client-funds callout pointing
at the existing PBA ledger." Confirmed these still pass unchanged. Not
independently re-verified in this pass: that awarding each of these codes
also surfaces the *right specific set* of deferred (location/client/staff)
facts on the newly-relevant records — the general mechanism is proven
correct (Parts 1–2's real-DB tests) but a per-code "does awarding RHS
specifically make the RHS-relevant deferred facts appear" audit was not
performed for all three codes individually; flagged rather than assumed.

**Later fact changes invalidate or reevaluate the relevant state
correctly.** — The *trigger* is proven at both the unit level
(source-assertion tests confirming the panel calls `reevaluate()` after a
successful save, for client/staff/assignment scope) and structurally (the
reevaluation functions themselves — `reevaluateStaffDutiesInternal`,
`reevaluateStaffAssignedToClientInternal` — are pre-existing, independently
tested code, unchanged by this work). What is **not** proven, and stated
plainly in `AGENCY_SETUP_COVERAGE_AUDIT.md` §1: reevaluating currently has
no observable effect on any requirement's applicability, because
`duty-applicability.ts` does not read `compliance_fact_answers` for any
scope yet. This is not a contradiction — it is the same "collected but not
yet consumed" gap found for the six new agency-level facts, restated for the
deferred-fact side of the registry. The trigger firing correctly is real and
proven; the downstream effect it will eventually have is not yet built.

## Test inventory

- `npm run test:agency-setup-integration` — 18/18, stable across repeated
  runs against the same non-reset database (verified 3+ consecutive runs at
  each stage of this change).
- `node --test src/lib/agency-setup-gate.test.ts
  src/lib/obligations/agency-setup-questions.test.ts` — 41/41 (in-memory,
  registry-shape and conditional-visibility checks).
- Full project suite: 1293/1297 — the same 4 failures as baseline commit
  `793c6f8f`, confirmed unrelated (see the PR body / commit messages for
  names and the direct baseline re-run that reproduced each one before any
  change in this session).
- Full project build: clean at every stage of this change.
