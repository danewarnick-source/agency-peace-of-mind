// Records > Export — one configurable CSV export replacing the old
// hardcoded Master Ledger + Export Hours buttons. Admin picks exactly which
// fields go in the file; the row set always respects whatever filters are
// already active on the Records page (passed in by the caller). PDF output
// is a planned second phase — not built here, since it needs real PDF
// generation rather than just a different file extension.
//
// This does NOT touch src/components/evv/utah-export-dialog.tsx — the Utah
// DHHS EVV export stays a fixed, non-customizable format matching the
// state's required specification.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/utah-evv-export";

export interface ExportRow {
  recordType: "Billable" | "Non-billable";
  staffName: string;
  clientName: string;
  memberId: string;
  serviceCode: string;
  date: string;
  clockIn: string;
  clockOut: string;
  durationMin: number;
  editedByAdmin: boolean;
  editedByAdminName: string;
  geofence: string;
  exceptions: string;
  teamName: string;
}

interface FieldDef {
  key: keyof ExportRow;
  label: string;
  defaultChecked: boolean;
  get: (r: ExportRow) => string;
}

const FIELD_DEFS: FieldDef[] = [
  { key: "staffName", label: "Caregiver", defaultChecked: true, get: (r) => r.staffName },
  { key: "clientName", label: "Client", defaultChecked: true, get: (r) => r.clientName },
  { key: "memberId", label: "Medicaid Member ID", defaultChecked: true, get: (r) => r.memberId },
  { key: "serviceCode", label: "Service Code / Category", defaultChecked: true, get: (r) => r.serviceCode },
  { key: "date", label: "Date", defaultChecked: true, get: (r) => r.date },
  { key: "clockIn", label: "Clock In", defaultChecked: true, get: (r) => r.clockIn },
  { key: "clockOut", label: "Clock Out", defaultChecked: true, get: (r) => r.clockOut },
  { key: "durationMin", label: "Duration (minutes)", defaultChecked: true, get: (r) => String(r.durationMin) },
  { key: "editedByAdmin", label: "Edited by Admin (Yes/No)", defaultChecked: true, get: (r) => (r.editedByAdmin ? "yes" : "no") },
  { key: "editedByAdminName", label: "Edited By (Name)", defaultChecked: false, get: (r) => r.editedByAdminName },
  { key: "geofence", label: "Geofence Status", defaultChecked: true, get: (r) => r.geofence },
  { key: "exceptions", label: "Exceptions / Flags", defaultChecked: true, get: (r) => r.exceptions },
  { key: "teamName", label: "Home / Team", defaultChecked: true, get: (r) => r.teamName },
  { key: "recordType", label: "Billable / Non-billable", defaultChecked: false, get: (r) => r.recordType },
];

function defaultSelected(): Set<string> {
  return new Set(FIELD_DEFS.filter((f) => f.defaultChecked).map((f) => f.key));
}

function esc(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function RecordsExportDialog({
  open, onClose, rows, from, to,
}: {
  open: boolean;
  onClose: () => void;
  rows: ExportRow[];
  from: string;
  to: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(defaultSelected);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectedFields = FIELD_DEFS.filter((f) => selected.has(f.key));

  const handleExport = () => {
    if (rows.length === 0) {
      toast.info("Nothing to export — adjust filters first.");
      return;
    }
    if (selectedFields.length === 0) {
      toast.info("Select at least one field to export.");
      return;
    }
    const header = selectedFields.map((f) => f.label);
    const body = [header.join(",")].concat(
      rows.map((r) => selectedFields.map((f) => esc(f.get(r))).join(",")),
    ).join("\r\n");
    downloadCsv(`records-export_${from}_${to}.csv`, body);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export records</DialogTitle>
          <DialogDescription>
            Choose which fields to include. The export respects the filters currently applied on the Records page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Format
            </label>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="default" disabled className="pointer-events-none">
                CSV
              </Button>
              <span className="text-xs text-muted-foreground" title="PDF export is planned for a later release.">
                PDF — coming soon
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Fields ({selectedFields.length} of {FIELD_DEFS.length} selected)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-[11px] font-medium text-[#137182] hover:underline"
                onClick={() => setSelected(new Set(FIELD_DEFS.map((f) => f.key)))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-[11px] font-medium text-[#137182] hover:underline"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid max-h-[320px] grid-cols-1 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
            {FIELD_DEFS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.has(f.key)}
                  onCheckedChange={() => toggle(f.key)}
                />
                {f.label}
              </label>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {rows.length.toLocaleString()} record{rows.length === 1 ? "" : "s"} will be exported.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={handleExport} disabled={rows.length === 0 || selectedFields.length === 0} className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
