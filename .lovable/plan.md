Add a temporary `console.log` immediately after the `activeClientGoals` `useMemo` in `src/components/evv/punch-pad.tsx` (around line 897-900), inside a `useEffect` keyed on `careData.data` so it only fires when the data changes.

The log should be clearly labeled and print the full raw `careData.data` object so the goals array (with `job_codes`) and `visibility.goalsForStaff` are visible in the browser console:

```ts
useEffect(() => {
  console.log("[DIAGNOSTIC care data]", careData.data);
}, [careData.data]);
```

No other logic changes; this is a throwaway debugging aid to be removed later.