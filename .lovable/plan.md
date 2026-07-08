
# Mount MedicationsManager inside the eMAR (wire, don't rebuild)

## Scope

Make the already-built `MedicationsManager` (add/edit meds) and its `AIImportDialog` (parse pharmacy/physician order → review → save) reachable from the MAR/eMAR tab. No new component, no new server function, no schema change — pure wiring.

## Changes

### 1. `src/components/medications-manager.tsx` — expose the AI import trigger

The `AIImportDialog` is fully implemented (lines 750–886) and the `parseAI` server-fn hook, `importOpen` state, and `bulkInsertMut` are already declared — they were left un-triggered when the per-section NECTAR import was removed. Add the missing Dialog trigger next to "Add Medication" in the header (around line 292):

```
<Dialog open={importOpen} onOpenChange={setImportOpen}>
  <DialogTrigger asChild>
    <Button type="button" size="sm" variant="outline">
      <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload MAR / Order
    </Button>
  </DialogTrigger>
  <AIImportDialog
    onParse={async (p) => {
      const r = await parseAI({ data: p });
      return (r.medications ?? []).map((m) => ({ ...EMPTY, ...m,
        scheduled_times: m.scheduled_times ?? [] }));
    }}
    onCommit={(rows) => bulkInsertMut.mutate(rows)}
    committing={bulkInsertMut.isPending}
  />
</Dialog>
```

Parse → review (editable table) → explicit "Save N Medications" click. No silent writes — same discipline as the other NECTAR parsers.

### 2. `src/components/workspace/mar-emar-tab.tsx` — mount inside the Chart sub-tab

At the top of the `Chart` `TabsContent` (currently just `<MedicationChart clientId={clientId} />` at line 1658–1660), render `MedicationsManager` above the chart for admin/manager roles:

```
<TabsContent value="chart" className="space-y-4 pt-2">
  {(role === "admin" || role === "manager" || role === "super_admin") && (
    <MedicationsManager clientId={clientId} organizationId={orgId ?? undefined} />
  )}
  <MedicationChart clientId={clientId} />
</TabsContent>
```

Imports to add: `MedicationsManager` from `@/components/medications-manager`, `usePermissions` from `@/hooks/use-permissions` (component already has `orgId`).

### 3. Empty-state wording

`MedicationChart`'s empty-state copy already reads "Add medications from the chart manager." With MedicationsManager now mounted directly above it, that pointer is live — no copy change required. (The Add Medication + Upload MAR / Order buttons sit in the manager's header, visible even when zero meds exist.)

## Not changed

- `EmarEligibilityGate` / `self_admin_med_support` flag — unchanged. The manager mounts inside the Chart sub-tab, which only renders after the client is flagged for self-directed self-administration (per the prior report). Flipping that flag remains the admin's one-time toggle on the gate screen.
- Staff workspace eMAR — same component, so staff who reach the Chart sub-tab in an admin/manager role would also see it; permission gate above prevents non-admins from adding/editing meds. Log-administrations flow (Today/pass surface) untouched.
- RLS / `client_medications` policies / `parseMedicationsAI` — unchanged.
- `MarEmarTab`'s 7 sub-tabs, layout, banners, gate — unchanged.

## Verification

- `bun run tsgo` on the two edited files.
- Playwright: open admin client profile → Care → MAR/eMAR (for a client already flagged self-admin with zero meds — flip the flag on the gate first if needed). Confirm:
  1. Chart sub-tab shows "Add Medication" + "Upload MAR / Order" buttons in the manager header.
  2. Clicking Add Medication opens the form dialog; saving inserts a row and it appears both in the manager table AND in the MedicationChart profile grid below.
  3. Clicking Upload MAR / Order opens the AIImportDialog; pasting order text → "Parse Text" produces an editable review table; "Save N Medications" writes and toasts success.
  4. All rendered on a client with zero meds beforehand.
