## Goal

Make notifications in the admin bell directly actionable: every notification with a destination should expose a clear button that takes the admin straight to the page where they can resolve it (e.g., a declined shift → Schedule Builder).

## Current behavior

- The bell already stores a `link_to` on every notification. For declined shifts it's `/dashboard/scheduling?tab=builder`.
- Clicking anywhere on the row currently navigates there and marks it read — but there's no visible call-to-action, so it reads as "just a list," which is what the user is reporting.

## Change (UI only — `src/components/NotificationBell.tsx`)

1. **Add a visible "Resolve" button** at the bottom of each notification row that has a `link_to`.
   - Label: `Resolve →` for unread urgent/critical, `Open →` for everything else (and the CE synthetic entry, which keeps its existing target).
   - Styling: small primary-tinted button, right-aligned under the body text, so it's obviously tappable on both desktop and mobile (≥44px tap target on mobile per project rule).
   - Clicking it: marks the notification read (unless synthetic), closes the panel, navigates to `link_to` — same flow as the existing row click, just promoted to a dedicated control.
2. **Keep the whole-row click** as a secondary affordance so existing behavior isn't lost.
3. **Dismiss (X)** stays where it is and continues to only dismiss without navigating.
4. **No backend / schema / business-logic changes.** `link_to` is already correct for declines and all other notification types currently emitted.

## Acceptance

- Opening the bell shows each notification with a clearly labeled action button.
- Clicking "Resolve →" on a declined-shift notification closes the panel, marks it read, and lands the admin on `/dashboard/scheduling?tab=builder`.
- Other notification types navigate to their own `link_to` (incident reports, timesheet exceptions, CE roster, etc.) with no per-type code paths needed.
- The Dismiss (X) button still just dismisses; row click still navigates.
- Mobile: button is full-width-ish inside the row, tap target ≥44px tall.
