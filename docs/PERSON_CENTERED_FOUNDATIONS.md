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
- Locked hire set: `HIRE_ALWAYS_TITLES` in `obligation-auto-assign.ts`
- Fan-out: `onStaffHiredInternal` in `staff-assignment-hooks.functions.ts` (new hire, import, hire-date set)

Not per-client. Not gated by assignment flags.

## Seat paywall (orientation / compliance family)

Opening PCT, 30-day, ABI, or the 12-hour CE placeholder uses `thirtyDayCourseAccessFn` / `courseUsesTrainingSeat`:

| Org | Unlock |
| --- | --- |
| True North / billing-exempt (`thirtyDayOrgIsComped` / `isBillingExempt`) | Free — no roster seat |
| Paid org | Paid or waived roster seat with `training_type` `thirty_day` or `package` |
| Training-only buyer | Paid `training_only_seats` SKU `thirty_day` or `pack` |

No new Stripe product or price. Existing 30-day / pack seats unlock the family.

## Training family (30-day + PCT + ABI + 12hr)

Documented in `TRAINING_SEAT_FAMILY` (`in-hive-training-access.ts`):

| Item | In-Hive course | Seat-gated | Auto-assign | Today |
| --- | --- | --- | --- | --- |
| 30-day orientation | Yes (complete) | Yes | Hire-always | Stripe / roster `thirty_day` + `package`; training-only `thirty_day` / `pack` |
| Hire-level PCT | Yes (complete) | Yes | Hire-always | Same seat |
| ABI | Yes (complete — not a placeholder) | Yes (open course) | Assignment-only (`assignmentNeedsAbi`) | Same seat. Obligation may exist before a seat is purchased; Open course still needs the seat. TNS free. |
| 12-hour ongoing | Placeholder `pi-annual-ce-12hr` | Yes (open placeholder) | Hire-anniversary year 2 (existing cadence) | Coming soon. Upload / CE ledger remain the SOW path. Fulfill flag off. No invented lessons or keys. |

Stripe `pack` is still CPR + 30-day + Mandt (`trainingOnlyPackCovers`). Buying that pack or a 30-day seat unlocks this family. No new prices.

### ABI double-gate (intentional)

SOW still assigns ABI only when the staff/client needs it. The in-app course additionally requires the shared training seat (same as 30-day / PCT). Do not auto-assign ABI to every staff.

### 12-hour placeholder

`ANNUAL_CE_COURSE_FULFILLS_OBLIGATION = false`. Opening the shell shows **Coming soon**. Upload on the staff-file card still clears On file.

## Release control

| Flag | File | Current | Meaning |
| --- | --- | --- | --- |
| `PCT_IN_HIVE_COURSE_ENABLED` | `src/lib/in-hive-training-pct.ts` | `true` | Show Open course on the hire-level card |
| `PCT_COURSE_FULFILLS_OBLIGATION` | same | `true` | Passing the exam writes `in_hive_course` evidence / On file |
| `ANNUAL_CE_IN_HIVE_COURSE_ENABLED` | `src/lib/in-hive-training-annual-ce.ts` | `true` | Show Open course on the annual CE card (placeholder) |
| `ANNUAL_CE_COURSE_FULFILLS_OBLIGATION` | same | `false` | Placeholder does **not** write On file |

## Stay off

No Core SQL. No `scope_assignments`, Admin Profile permissions, or Compliance nav work in this change. Do not replace `person-centered-training-content.json`. Do not invent ABI or 12-hour curriculum.
