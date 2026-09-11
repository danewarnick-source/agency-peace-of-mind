# Person-centered foundations (hire-level)

In-platform course for the existing hire-level obligation **Person-Centered Thinking and Practices Training**.

- Course id: `pi-person-centered-foundations`
- Display title: Person-centered thinking in everyday support
- Content file: `src/lib/person-centered-training-content.json` (Dane attach, written verbatim)
- Attribution: NCAPPS-informed Provider Interface education — **not official NCAPPS**
- Separate from the per-client Person-Centered Thinking form (that work is #299)

## How staff open it

Staff file → hire-level PCT card → **Open course** → `/dashboard/my-obligations/course/$instanceId`.

Six topics, one server-graded formative check each, then a 15-question exam (pass 12/15, three attempts). Upload a certificate on the same card remains an alternate path. You do not need both.

## Auto-assign (every staff)

Hire-level PCT is already in the all-staff hire catalog — same path as Code of Conduct, conflict of interest, 30-day, and initial CPR:

- Catalog row: `sow-obligation-catalog.ts` title `Person-Centered Thinking and Practices Training`
- Locked hire set: `HIRE_ALWAYS_TITLES` / `titleGroupsForHire()` in `obligation-auto-assign.ts`
- Fan-out: `onStaffHiredInternal` in `staff-assignment-hooks.functions.ts` (new hire, import, hire-date set)

Not per-client. Not gated by assignment flags.

## Seat paywall (same as 30-day)

Opening the PCT course uses `thirtyDayCourseAccessFn` / `courseUsesThirtyDaySeat`:

| Org | Unlock |
| --- | --- |
| True North / billing-exempt (`thirtyDayOrgIsComped` / `isBillingExempt`) | Free — no roster seat |
| Paid org | Paid or waived roster seat with `training_type` `thirty_day` or `package` |
| Training-only buyer | Paid `training_only_seats` SKU `thirty_day` or `pack` |

No new Stripe product or price. The existing 30-day / pack seat unlocks both courses.

## Training family (30-day + PCT + ABI + 12hr)

Documented in `TRAINING_SEAT_FAMILY` (`in-hive-training-access.ts`):

| Item | In-Hive course | Seat-gated | How it exists today |
| --- | --- | --- | --- |
| 30-day orientation | Yes | Yes (this seat) | Stripe / roster `thirty_day` + `package`; training-only `thirty_day` / `pack` |
| Hire-level PCT | Yes | Yes (same seat) | Reuses the 30-day check above |
| ABI | Yes | No | Assignment-gated (`assignmentNeedsAbi`). No ABI Stripe SKU |
| 12-hour ongoing | No | No | Obligation / pack column `annual-ce` — upload + CE ledger only |

Stripe `pack` is still CPR + 30-day + Mandt (`trainingOnlyPackCovers`). Buying that pack (or a 30-day seat) now also unlocks PCT. It does **not** invent ABI or 12-hour course content, and it does not add new prices.

## Release control

| Flag | File | Current | Meaning |
| --- | --- | --- | --- |
| `PCT_IN_HIVE_COURSE_ENABLED` | `src/lib/in-hive-training-pct.ts` | `true` | Show Open course on the hire-level card |
| `PCT_COURSE_FULFILLS_OBLIGATION` | same | `true` | Passing the exam writes `in_hive_course` evidence / On file |

## Stay off

No Core SQL. No `scope_assignments`, Admin Profile permissions, or Compliance nav work in this change. Do not replace `person-centered-training-content.json`.
