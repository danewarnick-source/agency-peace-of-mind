## Problem

In `src/components/evv/punch-pad.tsx`, the start/end buttons hard-code "EVV Shift" regardless of the selected service code:

- Line 2082 / 2086 — End button: `aria-label="End EVV Shift"` and label `END EVV SHIFT`
- Line 2097 / 2105 — Start button: `aria-label="Start EVV Shift"` and label `START EVV SHIFT`

`isEvvLockedCode()` from `@/lib/evv-codes` already exists (used elsewhere in this same file) and returns true only for codes that actually require EVV transmission (COM, HSQ, PAC, ACA, CHA, RP2, RP3, SLH, SLN, CMP, CMS). All other codes (SEI, RHS, HHS, DSI, etc.) should read as plain time-clock actions.

## Fix (frontend copy only)

In `src/components/evv/punch-pad.tsx`:

1. End button (running shift). Compute once:
   ```ts
   const endIsEvv = isEvvLockedCode(active?.service_type_code ?? "");
   ```
   - `aria-label` → `endIsEvv ? "End EVV Shift" : "Clock Out"`
   - Visible label → `endIsEvv ? "⏹️ END EVV SHIFT" : "⏹️ CLOCK OUT"`

2. Start button (pre-clock-in). Use the already-in-scope `serviceCode`:
   ```ts
   const startIsEvv = isEvvLockedCode(serviceCode);
   ```
   - `aria-label` → `startIsEvv ? "Start EVV Shift" : "Clock In"`
   - Caption line (2104-2106) → `startIsEvv ? "▶️ START EVV SHIFT" : "▶️ CLOCK IN"`

3. Section `aria-label` at line 1875 — make it dynamic on the current mode too: `isRunning ? (endIsEvv ? "EVV Shift Punch Pad" : "Time Clock") : (startIsEvv ? "EVV Shift Punch Pad" : "Time Clock")` — so screen-reader users don't hear "EVV" for non-EVV codes.

No other strings changed. Lines 2307 ("Confirm Clock In & Start Shift"), 2390 ("Submit & Clock Out"), 2431 ("Got it — Start Shift") already use generic wording and are left alone. No logic/gating/business changes — the EVV geofence, consent gate, and locked-code enforcement still apply exactly as today; only the visible copy shifts to match the selected code.

## Verification

- Select an EVV-locked code (e.g., SLH) → buttons still say "START EVV SHIFT" / "END EVV SHIFT".
- Select a non-EVV code (e.g., HHS, DSI, SEI, RHS) → buttons say "CLOCK IN" / "CLOCK OUT" with no EVV wording anywhere on the pad.
