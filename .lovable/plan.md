## Problem

The "Fix Now" deep link adds `?verify=1` to the workspace URL to auto-open the Shift Verification & Medicaid Compliance form. That param stays in the URL, so every page reload (and every return to the tab) re-fires the auto-open effect and reopens the modal — even after the user has already closed it or navigated within the page.

## Fix

Strip `verify` from the URL as soon as the auto-open fires, so it's a true one-shot deep link and refreshes preserve the user's current page/tab state instead of jumping back into the compliance modal.

In `src/components/evv/punch-pad.tsx`, inside the existing `useEffect` that watches `autoOpenCompliance` + `active`:

- After calling `openCompliance()`, replace the URL to drop `verify` (keep `tab` and `code`):
  ```ts
  navigate({
    to: ".",
    search: (prev) => {
      const { verify: _drop, ...rest } = prev as Record<string, unknown>;
      return rest;
    },
    replace: true,
  });
  ```
- Use `useNavigate` from `@tanstack/react-router` (already an available import pattern in this file's ecosystem; add the import if it isn't already there).

Effect: the deep link opens the form once; the ref guard prevents re-firing within the mount; the URL rewrite prevents re-firing across reloads and back-navigation. Reloading the workspace keeps the user on the current tab with no modal.

## Files touched

- `src/components/evv/punch-pad.tsx` — add a `useNavigate` call and one `navigate({ ..., replace: true })` inside the auto-open effect to strip `verify` from the URL after the modal opens.
