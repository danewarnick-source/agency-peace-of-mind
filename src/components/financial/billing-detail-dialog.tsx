import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { fmtUSD, fmtHours, fmtUnits } from "@/lib/billing-units";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  getRevenueClientDetail,
  getMonthlyGridShiftDetail,
  type CodeLine,
  type ShiftDetailRow,
  type DailyDetailRow,
} from "@/lib/financial-detail.functions";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  year: number;
  month: number;
  providerName: string;
};

type RevenueClientProps = BaseProps & {
  variant: "revenue-client";
  clientId: string;
  clientName: string;
};

type GridRowProps = BaseProps & {
  variant: "grid-row";
  clientId: string;
  clientName: string;
  serviceCode: string;
};

export type BillingDetailDialogProps = RevenueClientProps | GridRowProps;

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function periodLabel(year: number, month: number) {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

function sanitize(s: string) {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}

// ─── CSV / Excel data shape: one row per shift or daily-day line ────────

type ExportRow = {
  Client: string;
  Code: string;
  Date: string;
  Staff: string;
  ClockIn: string;
  ClockOut: string;
  Hours: number | "";
  Units: number;
  Rate: number;
  Amount: number;
};

function shiftsToRows(
  clientName: string,
  code: string,
  rate: number,
  shifts: ShiftDetailRow[],
  days: DailyDetailRow[],
): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const s of shifts) {
    rows.push({
      Client: clientName,
      Code: code,
      Date: s.date,
      Staff: s.staffName,
      ClockIn: s.clockIn,
      ClockOut: s.clockOut ?? "",
      Hours: s.hours,
      Units: s.units,
      Rate: rate,
      Amount: s.amount,
    });
  }
  for (const d of days) {
    rows.push({
      Client: clientName,
      Code: code,
      Date: d.date,
      Staff: "—",
      ClockIn: "",
      ClockOut: "",
      Hours: "",
      Units: d.units,
      Rate: rate,
      Amount: d.amount,
    });
  }
  return rows;
}

function exportCsv(filename: string, rows: ExportRow[]) {
  if (rows.length === 0) {
    toast.error("Nothing to export.");
    return;
  }
  const headers = Object.keys(rows[0]) as (keyof ExportRow)[];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}

function exportXlsx(filename: string, rows: ExportRow[]) {
  if (rows.length === 0) {
    toast.error("Nothing to export.");
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Detail");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(filename, new Blob([buf], { type: "application/octet-stream" }));
}

function exportPdf(
  filename: string,
  title: string,
  providerName: string,
  period: string,
  client: string,
  sections: Array<{
    code: string;
    isDaily: boolean;
    rate: number;
    units: number;
    amount: number;
    shifts: ShiftDetailRow[];
    days: DailyDetailRow[];
  }>,
  grandTotal: number,
) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(providerName || "Provider", margin, y);
  y += 18;
  doc.setFontSize(12);
  doc.text(title, margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Client: ${client}`, margin, y);
  y += 12;
  doc.text(`Period: ${period}`, margin, y);
  y += 16;

  const pageW = doc.internal.pageSize.getWidth();
  const lineY = (n: number) => margin + 70 + n * 12;

  const ensureSpace = (rowsNeeded: number) => {
    const limit = doc.internal.pageSize.getHeight() - margin;
    if (y + rowsNeeded * 14 > limit) {
      doc.addPage();
      y = margin;
    }
  };

  for (const sec of sections) {
    ensureSpace(4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      `${sec.code} ${sec.isDaily ? "(Daily)" : "(Quarter-hour)"} — ${fmtUnits(sec.units)} ${sec.isDaily ? "days" : "units"} @ ${fmtUSD(sec.rate)} = ${fmtUSD(sec.amount)}`,
      margin,
      y,
    );
    y += 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    if (sec.isDaily) {
      doc.text("Date", margin, y);
      doc.text("Units", margin + 240, y, { align: "right" });
      doc.text("Amount", pageW - margin, y, { align: "right" });
    } else {
      doc.text("Date", margin, y);
      doc.text("Staff", margin + 70, y);
      doc.text("Hours", margin + 280, y, { align: "right" });
      doc.text("Units", margin + 340, y, { align: "right" });
      doc.text("Amount", pageW - margin, y, { align: "right" });
    }
    y += 12;
    doc.setFont("helvetica", "normal");

    if (sec.isDaily) {
      for (const d of sec.days) {
        ensureSpace(1);
        doc.text(d.date, margin, y);
        doc.text(String(d.units), margin + 240, y, { align: "right" });
        doc.text(fmtUSD(d.amount), pageW - margin, y, { align: "right" });
        y += 12;
      }
    } else {
      for (const s of sec.shifts) {
        ensureSpace(1);
        doc.text(s.date, margin, y);
        doc.text(s.staffName.slice(0, 32), margin + 70, y);
        doc.text(fmtHours(s.hours), margin + 280, y, { align: "right" });
        doc.text(fmtUnits(s.units), margin + 340, y, { align: "right" });
        doc.text(fmtUSD(s.amount), pageW - margin, y, { align: "right" });
        y += 12;
      }
    }
    y += 8;
  }

  ensureSpace(3);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Total To Bill: ${fmtUSD(grandTotal)}`, pageW - margin, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Generated ${new Date().toLocaleString()} · scope: ${client}, ${period}`,
    margin,
    doc.internal.pageSize.getHeight() - 24,
  );
  void lineY;

  doc.save(filename);
}

export function BillingDetailDialog(props: BillingDetailDialogProps) {
  const fetchRevenue = useServerFn(getRevenueClientDetail);
  const fetchGrid = useServerFn(getMonthlyGridShiftDetail);

  const enabled = props.open;
  const period = periodLabel(props.year, props.month);

  const revenueQ = useQuery({
    enabled: enabled && props.variant === "revenue-client",
    queryKey: ["fin-detail-revenue", props.organizationId, props.year, props.month, props.variant === "revenue-client" ? props.clientId : null],
    queryFn: () => {
      if (props.variant !== "revenue-client") throw new Error("wrong variant");
      return fetchRevenue({
        data: {
          organizationId: props.organizationId,
          year: props.year,
          month: props.month,
          clientId: props.clientId,
        },
      });
    },
  });

  const gridQ = useQuery({
    enabled: enabled && props.variant === "grid-row",
    queryKey: ["fin-detail-grid", props.organizationId, props.year, props.month, props.variant === "grid-row" ? props.clientId : null, props.variant === "grid-row" ? props.serviceCode : null],
    queryFn: () => {
      if (props.variant !== "grid-row") throw new Error("wrong variant");
      return fetchGrid({
        data: {
          organizationId: props.organizationId,
          year: props.year,
          month: props.month,
          clientId: props.clientId,
          serviceCode: props.serviceCode,
        },
      });
    },
  });

  const loading = (props.variant === "revenue-client" ? revenueQ.isLoading : gridQ.isLoading);
  const error = (props.variant === "revenue-client" ? revenueQ.error : gridQ.error) as Error | null;

  const lines: CodeLine[] = useMemo(() => {
    if (props.variant === "revenue-client") return revenueQ.data?.lines ?? [];
    const g = gridQ.data;
    if (!g) return [];
    return [{
      code: g.code,
      isDaily: g.isDaily,
      rate: g.rate,
      units: g.units,
      amount: g.amount,
      shifts: g.shifts,
      days: g.days,
    }];
  }, [props.variant, revenueQ.data, gridQ.data]);

  const total = useMemo(
    () => Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    [lines],
  );

  const clientName =
    props.variant === "revenue-client"
      ? (revenueQ.data?.client?.name ?? props.clientName)
      : (gridQ.data?.client?.name ?? props.clientName);

  const title =
    props.variant === "revenue-client"
      ? `Client billing detail — ${clientName}`
      : `Shift detail — ${clientName} · ${props.serviceCode}`;

  const fileBase = sanitize(
    props.variant === "revenue-client"
      ? `${clientName}_${props.year}-${String(props.month).padStart(2, "0")}_billing`
      : `${clientName}_${props.serviceCode}_${props.year}-${String(props.month).padStart(2, "0")}_shifts`,
  );

  const buildExportRows = (): ExportRow[] => {
    const rows: ExportRow[] = [];
    for (const l of lines) {
      rows.push(...shiftsToRows(clientName, l.code, l.rate, l.shifts, l.days));
    }
    return rows;
  };

  const handleCsv = () => exportCsv(`${fileBase}.csv`, buildExportRows());
  const handleXlsx = () => exportXlsx(`${fileBase}.xlsx`, buildExportRows());
  const handlePdf = () =>
    exportPdf(
      `${fileBase}.pdf`,
      title,
      props.providerName,
      period,
      clientName,
      lines,
      total,
    );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {period} · {props.providerName || "Provider"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={loading || !!error || lines.length === 0}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handlePdf}>
                <FileText className="mr-2 h-4 w-4" /> PDF report
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleXlsx}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleCsv}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="py-6 text-sm text-destructive">{error.message}</p>
          ) : lines.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No billing recorded for this scope.</p>
          ) : (
            <div className="space-y-5">
              {lines.map((l) => (
                <section key={l.code} className="rounded-lg border border-border">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{l.code}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${l.isDaily ? "bg-[#fde9c8] text-[#7a4308]" : "bg-[#e1efff] text-[#11498e]"}`}>
                        {l.isDaily ? "DAILY" : "Q"}
                      </span>
                      <span className="text-muted-foreground">
                        {fmtUnits(l.units)} {l.isDaily ? "days" : "units"} @ {fmtUSD(l.rate)}
                      </span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums">{fmtUSD(l.amount)}</span>
                  </header>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5">Date</th>
                          {!l.isDaily && <th className="px-3 py-1.5">Staff</th>}
                          {!l.isDaily && <th className="px-3 py-1.5 text-right">Hours</th>}
                          <th className="px-3 py-1.5 text-right">Units</th>
                          <th className="px-3 py-1.5 text-right">To Bill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.isDaily
                          ? l.days.map((d) => (
                              <tr key={d.date} className="border-t border-border/50">
                                <td className="px-3 py-1.5 font-medium">{d.date}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{d.units}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{fmtUSD(d.amount)}</td>
                              </tr>
                            ))
                          : l.shifts.map((s) => (
                              <tr key={s.shiftId} className="border-t border-border/50">
                                <td className="px-3 py-1.5 font-medium">{s.date}</td>
                                <td className="px-3 py-1.5">{s.staffName}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{fmtHours(s.hours)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{fmtUnits(s.units)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{fmtUSD(s.amount)}</td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
              <div className="flex items-center justify-between rounded-lg border border-foreground/20 bg-muted/30 px-4 py-3">
                <span className="font-semibold">Total To Bill</span>
                <span className="font-mono text-lg font-bold tabular-nums">{fmtUSD(total)}</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
