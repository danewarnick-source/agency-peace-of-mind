import { Archive } from "lucide-react";

/** Renders a permanent visual marker for timesheet rows imported from a
 *  historical spreadsheet (import_source === 'historical_import'). Never
 *  appears on live clock punches. */
export function HistoricalTimesheetBadge({
  size = "sm",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const cls =
    size === "md"
      ? "text-xs px-2 py-0.5"
      : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      title="Imported from a historical spreadsheet — this did not happen live in HIVE."
      className={`inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 font-medium uppercase tracking-wider text-amber-700 ${cls} ${className}`}
    >
      <Archive className="h-3 w-3" />
      Historical import
    </span>
  );
}

export function isHistoricalTimesheet(row: { import_source?: string | null } | null | undefined): boolean {
  return !!row && row.import_source === "historical_import";
}
