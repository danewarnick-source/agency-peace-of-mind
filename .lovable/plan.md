## What's actually happening

The message you're seeing — **"I didn't catch that — try: 'Cover Maple house overnight Mon–Fri with Sarah'."** — is not NECTAR saying it doesn't understand. It's the catch branch when `JSON.parse(rawAIResponse)` throws.

In `src/lib/nectar-schedule-actions.functions.ts` (line 283) and `src/lib/nectar-schedule-parse.functions.ts` (line 111), when Bedrock returns content that isn't pure JSON (e.g. wrapped in ```json fences, or prefixed with "Sure, here's the JSON: ..."), the code silently swallows the parse error and returns this generic "ask" message. So you can't tell whether the issue is:

- Claude wrapped the JSON in markdown fences (very common with Sonnet, even when told not to),
- Claude returned prose explaining it can't see any clients/staff,
- The context object we sent it actually IS empty (no clients/staff/teams on this org/week),
- Or something else.

The Bedrock call itself succeeded — we never got to the improved error reporting we added last turn, because the failure is on the JSON parse, not on the AWS call.

## Fix

### 1. Harden the JSON extraction (both files)

Wrap the parse in a helper that:
1. Strips ```json / ``` code fences.
2. Falls back to extracting the first `{ ... }` block via regex.
3. If still unparseable, **throws** an Error containing the first ~300 chars of the raw model output — so the toast shows what Claude actually said instead of a canned line.

### 2. Detect empty context and short-circuit before calling the AI

In `NectarCommandBar`, if `clients.length === 0` or `staff.length === 0` for the current week, show an inline hint ("No clients/staff loaded for this week — NECTAR has nothing to schedule against") instead of round-tripping to Bedrock. This is the most likely root cause of the model returning prose instead of structured actions: with empty IDs there's nothing valid it can produce.

### 3. Log the raw model output on the server

Add `console.error("[nectar-schedule] non-JSON model output:", raw.slice(0, 500))` in the catch path so we can confirm in server-function logs what Claude is actually returning. No PII risk — it's the model's own text.

### Files touched

- `src/lib/nectar-schedule-actions.functions.ts` — replace the two `JSON.parse(raw)` try/catch blocks (proposeSchedulingActions + proposeScheduleImport) with the hardened helper; log raw on failure.
- `src/lib/nectar-schedule-parse.functions.ts` — same hardening at line 110-112.
- `src/components/schedule-preview/nectar-command-bar.tsx` — pre-flight check for empty `clients`/`staff` with a friendly inline message; don't fire the mutation.

### What this does NOT change

- No prompt changes, no model changes, no Bedrock config changes.
- The validateAndResolve path (which already returns "ask" with a more specific question when the AI returns a valid-but-empty JSON object) is untouched.

## Expected outcome

After this ships, clicking "Draft it" will either:
- Succeed (if Claude is just adding fences),
- Show the actual model output snippet in the toast (so we can see exactly what it said), or
- Show "No clients/staff loaded — nothing to schedule against" before the call even happens.

That's the diagnostic info we need to know whether the next fix is a prompt tweak, a context-loading fix, or something else.
