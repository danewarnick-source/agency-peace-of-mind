# Nav label cleanup in src/routes/dashboard.tsx

## Changes

Three small edits to the nav arrays in `src/routes/dashboard.tsx`:

1. **ADMIN_NAV (line 160):** Remove the `{ to: "/dashboard/my-obligations", label: "My obligations", icon: ClipboardList }` entry entirely. "My obligations" stays in STAFF_NAV only.

2. **ADMIN_NAV (line 159):** Rename label from `"Company obligations"` → `"Compliance"`.

3. **STAFF_NAV (line 144):** Rename label from `"My obligations"` → `"My Compliance"` to match the new language.

No other files touched. No logic changes — pure label/entry cleanup.
