# Why the Incidents tab takes 5–30 seconds — and how to fix it

## What I measured

I loaded Documentation and switched to Incidents in a real browser session and timed every request, and I checked the database's slowest-query report.

- The database is **not** the problem. Incident queries don't appear anywhere in the slowest-query list, and each incident request came back in roughly 0.4–0.7 seconds.
- The slowness is in how the page fetches: it waits in a chain instead of fetching in parallel, and it throws away what it already loaded every time you come back.

## What's actually happening when you click Incidents

1. Nothing starts until the app re-resolves who you are and which organization is active.
2. Only then does the incident list request go out — and separately a second "trends" request that runs two more database aggregations.
3. After the list comes back, the app fires *another* request just to translate staff IDs into names. That's a third step that can only start once step 2 finishes.
4. At the same time the tab loads **every client in the organization** just to populate the client filter dropdown.
5. The charts library (recharts) for the trends strip loads eagerly as part of the tab, which adds seconds on the first click.
6. None of these results are cached, so leaving the tab and coming back repeats the entire chain from zero — and the page also has other timers polling in the background competing for the same connections.

Each step is fast on its own; stacked in sequence with no caching, they add up to the 5–30 seconds you're seeing.

## The fix

1. **Cache the results.** Give the incident list, the staff-name lookup, and the trends feed a sensible freshness window and keep showing the previous rows while refreshing. Returning to the tab then renders instantly instead of spinning.
2. **Remove the third round trip.** Have the incident list return reporter names with the list itself, instead of a follow-up request that can't start until the list lands.
3. **Stop blocking on the client list.** The full org client roster is only needed for the filter dropdown — load it lazily and never let it hold up the incident rows.
4. **Load the charts on demand.** Split the trends strip (recharts) into a lazily loaded chunk that renders after the list, so the incident rows paint first.
5. **Keep filters snappy.** Changing status/category/client keeps the current rows visible while the new query runs, instead of blanking the page.
6. **Verify the index.** Confirm `incident_reports` has an index covering organization + discovered date ordering; add one only if the query plan shows it's missing.

Expected result: incident rows appear in about a second on first open and effectively instantly on return, with charts filling in a moment later.

## Technical notes

- `src/components/incidents/admin-incidents-section.tsx`: add `staleTime` + `placeholderData: keepPreviousData` to the `incidents` and `incident-actors` queries; drop the dependent actors query once names come from the list; make `useCaseload` non-blocking for the filter.
- `src/lib/incidents.functions.ts`: extend `listIncidents` to resolve reporter display names server-side (two queries joined in JS — no PostgREST embed between `organization_members` and `profiles`, per project rule).
- `src/components/incidents/incident-trends-strip.tsx`: convert to `React.lazy` + `Suspense` at its usage site so recharts isn't in the tab's initial chunk; keep its existing `staleTime: 60_000`.
- No behavior, permission, or data changes — the org-scoped `organization_id` requirement and manager gate on `incidentTrends` stay exactly as they are.
