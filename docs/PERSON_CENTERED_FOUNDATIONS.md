# Person-centered foundations (hire-level)

In-platform course for the existing hire-level obligation **Person-Centered Thinking and Practices Training**.

- Course id: `pi-person-centered-foundations`
- Display title: Person-centered thinking in everyday support
- Content file: `src/lib/person-centered-training-content.json` (Dane attach, written verbatim)
- Attribution: NCAPPS-informed Provider Interface education — **not official NCAPPS**
- Separate from the per-client Person-Centered Thinking form

## How staff open it

Staff file → hire-level PCT card → **Open course** → `/dashboard/my-obligations/course/$instanceId`.

Six topics, one server-graded formative check each, then a 15-question exam (pass 12/15, three attempts). Upload a certificate on the same card remains the SOW path.

## Release control

| Flag | File | Current | Meaning |
| --- | --- | --- | --- |
| `PCT_IN_HIVE_COURSE_ENABLED` | `src/lib/in-hive-training-pct.ts` | `true` | Show Open course on the hire-level card |
| `PCT_COURSE_FULFILLS_OBLIGATION` | same | `false` | Passing the exam does **not** write `in_hive_course` evidence / On file |

Do not assign this course as contract-satisfying until the fulfill flag is released.

## What still needs Dane mapping

1. Confirm the attached JSON matches the demo zip if a later dump exists.
2. Flip `PCT_COURSE_FULFILLS_OBLIGATION` when Apex wants the course to clear the SOW card.
3. No Core SQL. No `scope_assignments`, Admin Profile permissions, or Compliance nav work in this change.
4. Per-client Person-Centered forms stay on the client-training viewer.
