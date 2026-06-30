# Fix: "Something went wrong in the dashboard shell" on Smart Import review

## Root cause

In `src/routes/dashboard.smart-import.$jobId.review.tsx`, `SubjectReview` declares `useState<WizardStepId>("person")` on line 322 — **after** the early returns for `q.isLoading` (line 311) and `q.isError` (line 312).

On the first render the query is loading, so the component returns before reaching that `useState`. When the query resolves, the component renders past the early returns and calls one more hook than before. React fails with "Rendered more hooks than during the previous render" and the dashboard error boundary shows "Something went wrong in the dashboard shell".

This is why it reproduces immediately after confirming the PCSP import — the review route mounts, the loader resolves, and the hook count changes between renders.

## Fix (one file, presentational only)

`src/routes/dashboard.smart-import.$jobId.review.tsx` — move all hook calls in `SubjectReview` above the early returns:

1. Keep `useServerFn`, `useQueryClient`, `useQuery` at the top (already there).
2. Move `const [step, setStep] = useState<WizardStepId>("person")` up so it sits with the other hooks, before the `if (q.isLoading)` / `if (q.isError)` guards.
3. Leave the derived values (`subject`, `fields`, `validation`, `steps`, `activeIdx`, etc.) where they are — they're computed after the guards from `q.data`, which is fine because they aren't hooks.

That's the entire fix; no new server functions, no schema, no behavior change beyond unblocking the render.

## Verification

- Reload `/dashboard/smart-import/<jobId>/review` after a PCSP import; the page renders the header + step rail + wizard instead of the error boundary.
- No "Rendered more hooks…" entry in the console on subsequent navigations between subjects.
