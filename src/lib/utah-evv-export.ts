// Utah DHHS 30-column EVV CSV builder + types.
// The format mirrors what dashboard.compliance-desk.tsx already emits — the
// only changes are: real Member ID (pad-to-10), Provider ID + Vendor from
// org settings, addresses from the shift's approved location or client
// physical address, an INTEGER batch_id (sequential per org), and a
// sequential record_id per row. Corrections carry Orig_receipt_id.

export const UTAH_30_HEADER =
  "Member ID (req),First name (req),Middle initial,Last name (req),Service code (req),Service description,Provider ID (req),Employee Performing Service (req),Begin date (req),Begin time (req),Begin address (req),Begin Apt/Suite/Floor,Begin City (req),Begin State,Begin Zip,Begin Geo Latitude,Begin Geo Longitude,End date (req),End time (req),End Address1,End Address2,End City,End State,End Zip,End Geo Latitude,End Geo Longitude,Orig_receipt_id (req if CORRECTION),Batch_id (req),Record_id (req),EVV Vendor (req)";

export interface UtahExportLine {
  memberId: string;
  firstName: string;
  lastName: string;
  serviceCode: string;
  serviceDescription: string;
  providerId: string;
  employeeName: string;
  beginIso: string;
  endIso: string;
  beginAddress: string;
  beginLat: number;
  beginLng: number;
  endAddress: string;
  endLat: number;
  endLng: number;
  origReceiptId: string; // empty when not a correction
  vendor: string;
}

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtDateMDY(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
function fmtTimeHMSAmPm(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${pad2(m)}:${pad2(s)} ${ampm}`;
}
function csvEscape(s: string) {
  const v = s ?? "";
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Build one CSV row (header + lines built separately). recordId is 1-based. */
export function buildUtahCsvLine(line: UtahExportLine, recordId: number, batchNumber: number): string {
  return [
    csvEscape(line.memberId),
    csvEscape(line.firstName),
    "",
    csvEscape(line.lastName),
    csvEscape(line.serviceCode),
    csvEscape(line.serviceDescription),
    csvEscape(line.providerId),
    csvEscape(line.employeeName),
    csvEscape(fmtDateMDY(line.beginIso)),
    csvEscape(fmtTimeHMSAmPm(line.beginIso)),
    csvEscape(line.beginAddress),
    "",
    "",
    "",
    "",
    String(line.beginLat),
    String(line.beginLng),
    csvEscape(fmtDateMDY(line.endIso)),
    csvEscape(fmtTimeHMSAmPm(line.endIso)),
    csvEscape(line.endAddress),
    "",
    "",
    "",
    "",
    String(line.endLat),
    String(line.endLng),
    csvEscape(line.origReceiptId),
    String(batchNumber),
    String(recordId),
    csvEscape(line.vendor),
  ].join(",");
}

export function buildUtahCsv(lines: UtahExportLine[], batchNumber: number): string {
  return [UTAH_30_HEADER, ...lines.map((l, i) => buildUtahCsvLine(l, i + 1, batchNumber))].join("\r\n");
}

export function downloadCsv(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/** Previous full Sunday→Saturday week, returned as ISO YYYY-MM-DD. */
export function defaultPreviousWeek(): { start: string; end: string } {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const thisSun = new Date(now); thisSun.setDate(now.getDate() - dow); thisSun.setHours(0, 0, 0, 0);
  const lastSun = new Date(thisSun); lastSun.setDate(thisSun.getDate() - 7);
  const lastSat = new Date(thisSun); lastSat.setDate(thisSun.getDate() - 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return { start: fmt(lastSun), end: fmt(lastSat) };
}
