# Restyle the eMAR to match the mockups

Pure visual/layout restyle of the Today's Pass surface and its confirm modal. No data, no schema, no business logic changes. All colors come from Hive semantic tokens — no hardcoded hex.

## Scope (files touched)

- `src/components/workspace/mar-emar-tab.tsx` — header bar, disclaimer banner, client header card, Nectar panel, tab strip, time-block sections, pass rows, confirm modal
- `src/components/workspace/emar-chart.tsx` — only the small subcomponents reused by MarEmarTab (`EmarLegalBanner`, `ClinicalSafetyHeader`) get their visuals re-skinned to match
- `src/styles.css` — add any missing semantic tokens needed (e.g. amber "honey" surface, soft pill-icon tile, status-chip tints) so components stay token-driven

Out of scope: `/dashboard/emar` route, MAR Sheet calendar, Directives, Controlled & Inventory, History/audit tab, scheduler, forms, medication CRUD.

## Visual targets (from screenshots)

1. **Top app bar** — hex/honey HIVE mark on left, "HIVE" wordmark, small-caps subtitle `eMAR · MEDICATION SUPPORT`, amber `DEMO` pill, right-aligned `Acting service [HHS]` chip.
2. **Self-directed disclaimer banner** — full-width deep navy band, amber ⚠️ icon, bold lede `Self-Directed Administration Support Interface.` followed by the DOPL/DHHS clause.
3. **Client header card** — stethoscope icon, client name, green `HHS active` chip, DOB on left; right side `Allergies:` label + each allergen as a soft-red rounded pill.
4. **Safety alerts** — amber ⚠️ lines for "Choking / swallow-reflex risk…" and "Crushed-med policy per care plan…".
5. **Nectar AI Compliance Assistant** — honey-tinted card, sparkle icon + title, simulation actions as outlined chip-buttons with sparkle prefix ("Simulate a 9 AM refusal → 11 AM success", "Run Schedule II–IV narcotic audit", "Simulate critical low inventory", "Flag meds that worsen swallowing").
6. **Tab strip** — underlined active tab in primary amber, icons before labels: Today's Pass (clock), MAR Sheet (calendar), Directives (doc), Controlled & Inventory (shield-check), Compliance & Audit (history).
7. **Time-block headers** — small-caps muted label `MORNING · 8:00 AM`, `EVENING · 8:00 PM`, `AS NEEDED (PRN)`.
8. **Pass rows** — white card, soft-amber rounded tile with pill icon (syringe for PRN, red-tinted tile for controlled PRN), `HH:MM  MedName  dose · route` line, muted purpose subtitle, status chip underneath (`Window passed — documentation required` amber, `Upcoming` muted, `PRN · Schedule IV` red), primary amber `Observe & Confirm` button on the right.
9. **Confirm modal** — sections in order: Route of Administration select, Clinical Notes / Observations textarea, red-tinted "This is a medication error requiring immediate reporting" checkbox card, Staff Signature pad with Clear link, attestation checkbox in soft surface card, helper line "Complete the required (\*) items…", footer with `Cancel` + filled `Observe & Confirm Self-Administration` CTA (shield icon).

## Implementation notes

- Add to `src/styles.css` only what's missing: `--honey-surface`, `--honey-surface-foreground`, `--pill-tile`, `--pill-tile-foreground`, `--status-chip-warn`, `--status-chip-danger`, `--status-chip-muted`. Reuse existing primary/destructive/muted tokens where they fit.
- All chips/buttons use shadcn variants — no inline `bg-[#...]` or `text-white`.
- Keep every existing prop, query, server-fn call, and handler — only JSX/className changes.
- Re-verify build is clean after the rewrite.

## Risks

- `mar-emar-tab.tsx` is ~1.8k lines; the restyle is class/JSX-only but spans many sections. I'll do it in one focused pass and re-typecheck.
- The "Acting service" selector currently exists as functional state; I'll keep it wired and just restyle the trigger to match the chip in the mockup.
