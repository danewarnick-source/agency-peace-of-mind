## Finish BLUEPRINT_CLIENTS_PATCH steps 5C and 5D

Scope: only `src/routes/dashboard.clients.tsx`. No other files touched.

### 5C — Replace `StaffAssignmentTab`
Replace the entire existing `StaffAssignmentTab` function in `src/routes/dashboard.clients.tsx` with the dropdown-based version from the blueprint (lines 263–460):
- Dropdown of unassigned active staff + "Assign" button
- Assigned caregivers list with Remove buttons
- Right-rail "Real-Time Sync" info card
- Uses `useQuery`/`useMutation` against `organization_members`, `staff_assignments`
- Invalidates `["staff-assignments", clientId]` and `["caseload"]` on success

### 5D — NECTAR import buttons (3 placements)
Add the blueprint's NECTAR buttons (toast-only handlers, no real upload logic):
1. **ProfileTab** — at the bottom of the Identity & Contact `CardContent`: "NECTAR Import — Auto-fill from Document"
2. **PcspTab** — inside PCSP Goals card, after the goal list: "NECTAR Import — Extract Goals from PCSP Document"
3. **DocumentsTab** — inside upload card, after the dropzone: "NECTAR Analyze — Index for AI Search"

### Imports to ensure present in `dashboard.clients.tsx`
- `Sparkles` from `lucide-react` (add if missing)
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` from `@/components/ui/select` (verify; add if missing)
- `Plus`, `X`, `Loader2`, `Users`, `CheckCircle2` from `lucide-react` (verify; add any missing)
- `useMutation`, `useQuery`, `useQueryClient` from `@tanstack/react-query` (verify)
- `toast` from `sonner` (verify)

### Out of scope
- No schema changes, no other files, no behavior changes to existing tabs beyond the three button insertions.
- NECTAR buttons remain toast-only per blueprint (no upload pipeline).
