# NECTAR Staff — Scoped Assistant for the Staff App

A second, lower-privilege NECTAR surface for staff. It shares branding and "answer from data" behavior with admin NECTAR but is a completely separate code path with its own server function, its own context builder, and its own UI. Admin NECTAR endpoints are never reachable from the staff UI.

## 1. Scope contract (enforced server-side)

NECTAR Staff may read, per request, only:

- **Policies & procedures** — `nectar_documents` rows in the caller's org with `document_type IN ('policy','procedure','sop','contract')` and tagged staff-visible.
- **Training material** — HIVE built-in lessons the caller has been assigned/completed (`course_assignments` + `lessons`), plus org-uploaded training docs (`nectar_documents` `document_type='training'`).
- **Caller's own role/job info** — their `profiles` row, `organization_members` row (role, job_title), reimbursement & timeclock how-to policies.
- **Caller's own pay & reimbursement** — `evv_timesheets`, `nectar_pay_period`, `reimbursements` rows where `staff_id = auth.uid()` only.
- **Assigned clients only** — re-resolved at query time via `clients_for_staff(org, auth.uid())`. For each allowed client: PCSP goals, safety/behavioral needs, current medications/MAR-relevant info needed to deliver care.

Hard denies (enforced before the model call, not just by prompt):
- Any client not returned by `clients_for_staff` for this user right now.
- Any other staff member's pay, hours, or profile.
- Billing/financial/admin/business data, agency health, audit, 520, PBA ledger, hive-exec.
- Admin NECTAR tools (approvals, requirement mapping, authoritative-source ingestion, etc.).

If the question falls outside scope, the assistant declines and points to manager/admin — it does not guess and does not fall back to broader data.

## 2. Backend

New file: `src/lib/nectar-staff.functions.ts` (client-safe wrapper) and `src/lib/nectar-staff.server.ts` (server-only context builder + Lovable AI call).

Single server function: `askNectarStaff` (`createServerFn`, POST, `requireSupabaseAuth`).

Input (zod): `{ question: string (1..2000), conversationId?: string, clientId?: string }`.

Handler flow:
1. Resolve caller: `auth.uid()`, current org via `organization_members`. Reject if no active membership.
2. Build **allowed client id set** by calling `clients_for_staff(org, uid)`. If `clientId` is passed, assert it's in the set; otherwise return refusal.
3. Build context bundle (each section capped, ~ token budget):
   - Caller profile + role/job_title + worker_type/rates (own only).
   - Recent own timesheets + current pay period summary (reuse logic from `useNectarPayPeriod` server-side).
   - Org policies/procedures: latest N `nectar_documents` filtered to staff-visible types; include title + extracted text snippet + id for citation.
   - Training: completed/assigned lessons (title + summary) and org training docs.
   - For each assigned client (or the focused one): name, PCSP goals, safety notes, active medications/MAR-relevant fields. Pulled with explicit `.in('id', allowedClientIds)` guards.
4. Call Lovable AI Gateway (`google/gemini-3-flash-preview`) with a strict system prompt:
   - Identity: "NECTAR Staff — shift-manager assistant. Plain language, mobile-friendly."
   - Allowed-source list mirroring section 1.
   - Refusal rule for out-of-scope (other clients, other staff pay, billing/admin).
   - Non-authoritative disclaimer (explains policy; doesn't make compliance/business rulings).
   - Cite policy/training source titles inline when used.
5. Return `{ answer, citations: [{type:'policy'|'training'|'pcsp'|'pay', id, title}], usedClientIds }`. Never echo unallowed data even if the model hallucinates — citations are filtered against the same allowed sets before returning.

All Supabase reads use the auth-middleware client (RLS applies as the staff user) — service role is **not** used.

## 3. Frontend

New component: `src/components/staff-mobile/ask-nectar-staff.tsx`
- Bottom-sheet/full-screen chat panel using existing HIVE design tokens and NECTAR brand styling (`NectarBrand`, amber gradient).
- Header clearly labeled **"Ask NECTAR · Staff"** to distinguish from admin NECTAR.
- Optional client-context chip — when opened from a client workspace, auto-fills `clientId`.
- Conversation kept in React state for the session (no DB persistence in v1).
- Renders markdown answer + citation chips (reuse `source-citation-chip.tsx`).
- Mobile tap targets ≥44px; works in both staff mobile shell and desktop.

Entry points:
- New tab in `staff-bottom-tabs.tsx`: "Ask NECTAR" (sparkle/amber icon).
- Floating launcher button in `staff-mobile-shell.tsx` for quick access from any staff screen.
- Embedded "Ask about this client" button inside `client-quick-info-sheet.tsx` and the workspace/HHS hub headers (pre-fills `clientId`).
- New route `src/routes/dashboard.ask-nectar.tsx` for desktop staff access.

Admin NECTAR routes/components remain untouched and are not linked from any staff surface.

## 4. Privacy & assignment re-check

- Allowed client set is recomputed **every** request from `clients_for_staff`. Removing the assignment immediately stops answers about that client — no caching.
- Citation IDs returned to the client are only ones inside the allowed sets, so the UI cannot resolve restricted records even if forged.
- Refusals include a clear "ask your manager/admin" line.
- Add a brief one-time disclosure in the panel: "Client information shown here is for the people on your caseload. Treat it as confidential PHI."

## 5. Out of scope (this plan)

- Persisting conversation history to DB.
- Voice input.
- Streaming responses (returns full answer; can be upgraded to `streamText` later).
- Changes to admin NECTAR.

## Files

New:
- `src/lib/nectar-staff.functions.ts`
- `src/lib/nectar-staff.server.ts`
- `src/components/staff-mobile/ask-nectar-staff.tsx`
- `src/routes/dashboard.ask-nectar.tsx`

Edited:
- `src/components/staff-mobile/staff-bottom-tabs.tsx` — add tab.
- `src/components/staff-mobile/staff-mobile-shell.tsx` — mount launcher + sheet.
- `src/components/staff-mobile/client-quick-info-sheet.tsx` — "Ask NECTAR about this client" button.
- `src/components/workspace/about-tab.tsx` (or workspace header) — same entry, pre-filled client.

No database migrations required — all data is read through existing tables with RLS + the `clients_for_staff` SECURITY DEFINER function.
