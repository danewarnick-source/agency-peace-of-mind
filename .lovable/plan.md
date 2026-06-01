# Staff Portal Mobile-First Upgrade

Scope: ONLY the staff-facing portal (staff login + dashboard screens when "Staff View" is active). Admin views, back-end modules, and marketing pages are untouched.

## 1. Detect "staff portal" context

Add a helper that returns `true` when:
- The current route is under `/dashboard/*` AND
- `useEffectiveView().effective === "staff"` (uses existing `use-effective-view` hook — admins toggled into Staff View also get the mobile shell)

This gates all the new mobile chrome. Admin View keeps the current sidebar layout exactly as-is.

## 2. New components (mobile shell)

- `src/components/staff-mobile/staff-bottom-tabs.tsx` — fixed bottom tab bar (navy, safe-area inset), 4 tabs: Caseload (`/dashboard`), Time Clock (`/dashboard/timeclock`), Daily Logs (`/dashboard/daily-logs`), Trainings (`/dashboard/training`). Active = amber, inactive = muted white. Tap targets ≥48px. Hidden at `md:`.
- `src/components/staff-mobile/staff-top-bar.tsx` — sticky top app bar: hexagon logo + page title left; avatar button right opens a `Sheet` (bottom drawer) with Portal View switcher, user name + role, Sign out. Hidden at `md:`.
- `src/components/staff-mobile/staff-mobile-shell.tsx` — wraps page content with top bar + bottom bar padding (`pt-14 pb-20` on mobile) and safe-area insets.

## 3. Wire into `dashboard.tsx`

In `src/routes/dashboard.tsx`:
- If `inStaffPortal === true`: hide the existing sidebar on mobile (`hidden md:flex`), render `StaffMobileShell` wrapping `<Outlet />`. At `md:+` keep the existing sidebar.
- If `inStaffPortal === false` (admin view): unchanged.

## 4. Per-screen mobile tweaks

- **Staff login** (`src/routes/login.tsx`): single-column full-width fields, 48px inputs, `font-size: 16px` on inputs (prevents iOS zoom-on-focus), safe-area aware container.
- **My Caseload** (`staff-client-grid.tsx`): sticky full-width search bar on mobile (`sticky top-14 md:static`), keep current card layout (already full-width stacked).
- **General Time Clock** (`dashboard.timeclock.tsx` + `punch-pad.tsx`): large timer typography on mobile, primary action becomes a sticky bottom button on mobile (above tab bar via `bottom-20 md:static`), GPS/EVV status as compact badge row, `<select>`s replaced with bottom-sheet pickers (Radix `Sheet` with option list).
- **Daily Logs**: enforce single-column stack on mobile (`grid-cols-1 md:grid-cols-N`), keep amber alert card prominent.
- **My Trainings**: vertical full-width module cards.

## 5. PWA (staff portal only)

- Add `public/manifest.webmanifest` — name "HIVE Staff", `display: standalone`, `theme_color: #0d112b`, `background_color: #0d112b`, `start_url: /dashboard`, scope `/dashboard`, icons using the hexagon mark.
- Add hexagon icon PNGs (192, 512, maskable) to `public/`.
- Link manifest from `__root.tsx` head (with theme-color + apple-touch-icon).
- **No service worker** (per the PWA rules — manifest-only is enough for installability and avoids preview iframe issues).

## 6. Native-feel polish

- `-webkit-overflow-scrolling: touch` and `overscroll-behavior-y: contain` on scroll containers.
- Tap feedback: `active:scale-[0.98] transition-transform` on buttons/cards.
- Safe-area utilities via Tailwind arbitrary values (`pb-[env(safe-area-inset-bottom)]`).
- Smooth route transitions via existing TanStack transitions; no library added.
- Pull-to-refresh: lightweight implementation on Caseload + Daily Logs + Trainings lists using `react-query`'s `refetch` triggered by a touch handler at scrollTop=0.

## 7. Untouched

- All admin routes (Records Desk, Command Center, Compliance Desk, Host Home Control, all back-end settings).
- Marketing routes (`/`, `/about`, `/contact`, `/pricing`, etc.).
- All hooks, queries, mutations, RLS, and database logic.

## Technical notes

- Use existing `Sheet` from shadcn for bottom sheets (already in repo).
- Use `useIsMobile()` hook where conditional rendering is needed beyond CSS.
- All new tap targets meet the ≥44–48px rule from project memory.
- All new layouts use `flex-col` default and `md:flex-row` for desktop, per project memory.
