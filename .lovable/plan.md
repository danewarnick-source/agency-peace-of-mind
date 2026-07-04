## Why it's still hidden

No re-upload needed. Your SOW 2026 is stored with `owner_kind = 'state'` (state-issued document), and my last change filtered the Sources tab to `owner_kind = 'company'` only — so it got excluded. This is a one-line fix.

## Change

`src/lib/authoritative-sources.functions.ts` → `listAuthoritativeSources`: broaden the filter to include state-issued docs.

```ts
.in("owner_kind", ["company", "state"])
```

That covers everything a provider would treat as an authoritative source (company-uploaded contracts + state-issued SOWs/requirements) while still keeping `client` and `staff` PHI-scoped docs out of the Sources list.

No migration, no re-upload. As soon as it ships, SOW 2026 appears in Sources with the **Set kind** picker; choose "State Scope of Work" and Draft requirements is available.

## Files touched

- `src/lib/authoritative-sources.functions.ts` (one line)