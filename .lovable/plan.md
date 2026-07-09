## Problem

In `src/components/evv/punch-pad.tsx` (line 2809), the clock-out screen passes a live-updating `windowEnd` into the med-attestation check:

```tsx
<ShiftMedAttestation
  windowStart={active.clock_in_timestamp}
  windowEnd={new Date(now).toISOString()}   // `now` ticks every 1s
/>
```

`now` is the shift-timer state that re-renders every second (line 460: `setInterval(() => setNow(Date.now()), 1000)`). That value flows into `useShiftMedAttestationStatus`, where it becomes part of the React Query `queryKey`. New key every second → the query refetches every second → the attestation UI resets constantly and the user can never finish answering it, blocking clock-out.

## Fix

Freeze `windowEnd` to a single timestamp captured when the clock-out flow opens, instead of the ticking timer. The shift's actual window for the med check is "clock-in → the moment we're checking", which only needs to be sampled once (the med schedule is anchored on `clock_in_timestamp` and doesn't move as seconds pass).

### Change (frontend only, `src/components/evv/punch-pad.tsx`)

Inside `ShiftMedAttestation` render site:

- Compute a stable end-of-window with `useMemo`, keyed on `active.clock_in_timestamp` (and only recomputed if the active shift itself changes), e.g.:
  ```tsx
  const medCheckWindowEnd = useMemo(
    () => new Date().toISOString(),
    [active?.clock_in_timestamp],
  );
  ```
- Pass `windowEnd={medCheckWindowEnd}` instead of `new Date(now).toISOString()`.

That's the whole change. The 1-second timer keeps driving the on-screen elapsed clock; the med check receives a stable window and runs once per shift instead of once per second.

### Verification

- Open the clock-out sheet on a shift with active meds → attestation loads once, stays interactive, user can submit.
- The visible shift timer still ticks every second.
- No changes to hook logic, query, RLS, or DB.
