## Restore "Review renewals" button (and make it scroll)

**Change (single edit in `src/routes/dashboard.hive-training.index.tsx`, ~line 394):**

Revert the unassigned-staff banner line back to its original label and handler:

```tsx
cta="Review renewals"
onClick={() => scrollToRenewals()}
```

**Why this now works:** `scrollToRenewals()` was already hardened in the previous fix to fall back through targets that actually exist on the page:

```
ht-renewals  →  ht-storefront  →  ht-roster
```

So even when there are no renewal rows (renewals section not rendered), the click will smooth-scroll to the storefront (or the roster as a last resort) instead of silently doing nothing.

**No other changes:**
- Keep `scrollToRenewals()`, `scrollToStorefront()`, `scrollToRoster()` as they are.
- Keep the `id="ht-storefront"` on the Storefront section.
- No copy or behavior changes elsewhere.

**Verify:** on the training dashboard, click "Review renewals" in the readiness banner and confirm the page scrolls (to renewals if present, otherwise storefront).