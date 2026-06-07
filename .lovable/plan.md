## Fix: realtime channel reuse error in MAR/eMAR

**Root cause**
In `src/components/workspace/mar-emar-tab.tsx`, the realtime effect builds a channel with a fixed topic: `` `emar_logs:client:${clientId}` ``. Supabase keeps channels keyed by topic in a global registry, so on StrictMode double-invoke, Fast Refresh, or any remount where the previous channel hasn't been fully removed yet, `supabase.channel(sameTopic)` returns the already-subscribed instance. Calling `.on("postgres_changes", ...)` on an already-subscribed channel throws:

> cannot add `postgres_changes` callbacks for realtime:emar_logs:client:<id> after `subscribe()`

**Fix (single file, no DB / no logic changes)**

In `src/components/workspace/mar-emar-tab.tsx`, change the realtime `useEffect` (around lines 1068–1083) to:

1. Use a unique topic per mount, e.g. `` `emar_logs:client:${clientId}:${Math.random().toString(36).slice(2)}` `` (or a `useId()` value). This guarantees a fresh channel object even if a previous one is still being torn down.
2. Keep the existing `.on(...).subscribe()` chain and the existing `qc.invalidateQueries` payload (today / month / cal keys) exactly as is.
3. In cleanup, call `supabase.removeChannel(channel)` (unchanged).

No other behavior, query keys, append-only logic, history strip, RLS, or migration changes. Same realtime semantics — every INSERT on `emar_logs` for this client still invalidates the three MAR queries on every open dashboard.
