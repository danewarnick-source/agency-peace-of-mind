## Goal

Restyle the "Medication Administration Record" dialog in `src/components/workspace/mar-emar-tab.tsx` so it matches the simplified mockup exactly: a single scrollable form, no tabs, only the fields shown in the screenshot.

## Final dialog layout (top → bottom)

1. Header: pill icon + "Medication Administration Record", subtitle `{client} · {med} · Scheduled {time}`. Small text-link in header row: "View directives" (opens directives in a secondary lightweight sheet, since the tab is being removed).
2. Choking-risk alert (only when applicable) — kept, unchanged.
3. **Route of Administration *** — Select.
4. **Clinical Notes / Observations** — Textarea, placeholder "Observations, reactions, posture, anything relevant…".
5. **Medication-error checkbox** in red-tinted card: "This is a medication error requiring immediate reporting." Helper: "Notifies your administrator and flags this record for review (SOW c4)." Expand-on-check textarea kept.
6. **Staff Signature *** — SigPad, helper "Sign with mouse, finger, or stylus." with right-aligned "Clear".
7. **Attestation checkbox** in honey-tinted card with the existing `ATTESTATION_TEXT` referencing the client by name.
8. Helper line (muted): "Complete the required (*) items to confirm: status, route, time, signature, attestation."
9. Footer: `Cancel` (ghost) | primary amber **`Observe & Confirm Self-Administration`** with shield-check icon. Disabled until valid.

## Removed from this dialog

- The `Tabs` wrapper (Administration Log / Medication Directives). Directives move to a "View directives" link in the header that opens a secondary `Sheet`/`Dialog` rendering the existing `MedicationDirectivesPanel`. No content lost.
- "Time the Person actually took this medication" input + late-entry warning block. `actualTakenAt` still defaults to `now()` in state and is sent on submit; UI just hidden in this view.
- "Medication Confirmed" summary card (med name + dose already in the dialog subtitle).
- Outcome chip grid (Self-administered / Refused / Omitted / Missed). This dialog is the self-administration confirm path only — `status` is locked to `"administered"`. Refused / Omitted / Missed remain reachable from the row-level "Update Status" menu that already exists in the pass list.
- "Signing as {staff}" card (identity still captured silently from the account on submit).
- Exception Reason block (only appeared with non-administered statuses, which this dialog no longer offers).

## Conditional blocks kept (render inline only when applicable)

- PRN reason card (when `med.is_prn`).
- Controlled-substance pill count (when `med.is_controlled`).
- Rescue/seizure capture (when `med.is_rescue`).

These keep the same validators they have today, so `canSubmit` and the helper bullet list continue to work.

## Implementation notes (single file)

- File: `src/components/workspace/mar-emar-tab.tsx`.
- Inside the `EmarLogDialog` component (around lines 550–845): remove the `<Tabs>`/`<TabsList>`/`<TabsContent>` wrappers and the four removed blocks listed above. Keep all state, handlers, server-fn calls, and validators untouched — only JSX and classNames change.
- Hard-set `status = "administered"` on mount and drop the chip grid; remove `isException` branches in JSX (state can stay or be deleted along with `EXCEPTION_REASONS` import if unused).
- Add a small "View directives" trigger in `DialogHeader` that opens a second `Dialog` rendering `<MedicationDirectivesPanel med={med} />`. No new files.
- Footer becomes a `DialogFooter` with two buttons; primary uses the Hive amber gradient already wired (`bg-gradient-amber` / primary variant) and shows `ShieldCheck` + "Observe & Confirm Self-Administration".
- Re-run typecheck after the edit; fix any unused-import warnings (`Tabs*`, `EXCEPTION_REASONS`, etc.).

## Out of scope

- Pass-list rows, time-block headers, Nectar card, top app bar — already restyled in the previous turn, untouched here.
- Schema, server functions, billing logic — no changes.
