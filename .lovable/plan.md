# Fix MAR signature pad + enlarge MAR calendar

Two issues on the eMAR tab inside the client workspace (`src/components/workspace/mar-emar-tab.tsx`).

## 1. Signature gets wiped on desktop (cannot submit)

**Cause.** In `SigPad`, the canvas ref callback runs `clear()` on every render:

```tsx
ref={(el) => { canvasRef.current = el; if (el) setTimeout(clear, 0); }}
```

It also calls `onSigned(dataUrl)` inside `onPointerMove`. That updates parent state on every mouse move → parent re-renders → ref callback fires again → canvas is cleared mid-stroke. On touch devices it sometimes survives because of pointer capture timing, but on desktop the signature disappears the moment you lift the mouse and the "Sign the signature field above" requirement never clears, so Submit stays disabled.

**Fix.**
- Replace the ref-callback init with a `useEffect` that initializes (white fill + stroke style) exactly once when the canvas mounts.
- Use a plain `ref={canvasRef}` (no side effects in the callback).
- Stop calling `onSigned` inside `onPointerMove`. Call it once in `onPointerUp` / `onPointerLeave` after the stroke ends, only if `hasSigRef.current` is true.
- Keep `clear()` as the manual "Clear" button handler — also resets `hasSigRef` and calls `onSigned(null)`.

## 2. Calendar too small + current date not obvious

In `MarCalendarView` (same file):
- Bump day-column width from `w-7` to `w-10` and cell height from `h-7` to `h-10`; bump base font from `text-[11px]` to `text-xs`.
- Bump the medication name column from `min-w-[160px]` to `min-w-[200px]` and the status dot from `h-4 w-4` to `h-5 w-5`.
- Today's column header: replace the soft `bg-primary/10 text-primary` with a stronger highlight — `bg-primary text-primary-foreground font-bold ring-2 ring-primary rounded-sm` — so the current date column is unmistakable.
- Today's body cells: add a subtle `bg-primary/5` background so the whole column reads as "today" top-to-bottom.

## Scope

Only `src/components/workspace/mar-emar-tab.tsx` is touched. No data model, schema, or server-function changes. Other consumers of `MarCalendar` (the standalone `src/components/mar-calendar.tsx` used on the Clients page) are unaffected.
