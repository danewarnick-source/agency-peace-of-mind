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
  beginLat: number | null; // null = GPS absent; emits blank in CSV
  beginLng: number | null;
  endAddress: string;
  endLat: number | null;
  endLng: number | null;
  origReceiptId: string; // empty when not a correction
  vendor: string;
}

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }

export function isValidIso(iso: string): boolean {
  if (!iso) return false;
  return !isNaN(new Date(iso).getTime());
}

function fmtDateMDY(iso: string): string | null {
  if (!isValidIso(iso)) return null;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function fmtTimeHMSAmPm(iso: string): string | null {
  if (!isValidIso(iso)) return null;
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${pad2(m)}:${pad2(s)} ${ampm}`;
}

// Utah UEVV spec: these characters are forbidden in plain-text CSV fields and
// must be removed before submission (semicolons, angle brackets, curly
// braces, backslashes, ampersands, hash signs, apostrophes). Apostrophes are
// common in real names (O'Brien, D'Angelo), so this can't be skipped.
const UEVV_FORBIDDEN_CHARS = /[;<>{}\\&#']/g;

function sanitizeUevvText(s: string): string {
  return s.replace(UEVV_FORBIDDEN_CHARS, "");
}

function csvEscape(s: string) {
  const v = sanitizeUevvText(s ?? "");
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/**
 * Parse a US address string into components for separate CSV columns.
 * Handles two formats:
 *   "123 Main St, Salt Lake City, UT 84101"  (two commas — street, city, state+zip)
 *   "123 Main St City, ST 12345"             (one comma — street+city run together, then state+zip)
 * Falls back gracefully: if the format can't be confidently parsed, puts everything in street.
 */
export function parseUsAddress(address: string): { street: string; city: string; state: string; zip: string } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    // Last part: "UT 84101" → state + zip
    const stateZipTokens = parts[parts.length - 1].split(/\s+/);
    const state = stateZipTokens[0] ?? "";
    const zip = stateZipTokens[1] ?? "";
    const city = parts[parts.length - 2];
    const street = parts.slice(0, parts.length - 2).join(", ");
    return { street, city, state, zip };
  }

  if (parts.length === 2) {
    // One-comma format: street and city run together before the comma; the
    // zip is the last whitespace token after it, state the token before that.
    const stateZipTokens = parts[1].split(/\s+/).filter(Boolean);
    const zip = stateZipTokens[stateZipTokens.length - 1] ?? "";
    const state = stateZipTokens[stateZipTokens.length - 2] ?? "";
    const streetCityWords = parts[0].split(/\s+/).filter(Boolean);
    const zipLooksValid = /^\d{5}(-\d{4})?$/.test(zip);
    const stateLooksValid = /^[A-Za-z]{2}$/.test(state);

    if (zipLooksValid && stateLooksValid && streetCityWords.length >= 2) {
      // City is the word immediately before the state; everything before it is the street.
      const city = streetCityWords[streetCityWords.length - 1];
      const street = streetCityWords.slice(0, -1).join(" ");
      return { street, city, state, zip };
    }
  }

  return { street: address.trim(), city: "", state: "", zip: "" };
}

/**
 * Build one CSV row (header + lines built separately). recordId is 1-based.
 * Returns null if begin or end timestamp is missing or malformed — the caller
 * must exclude that line from the export and count it as skipped.
 */
export function buildUtahCsvLine(line: UtahExportLine, recordId: number, batchNumber: number): string | null {
  const beginDate = fmtDateMDY(line.beginIso);
  const beginTime = fmtTimeHMSAmPm(line.beginIso);
  const endDate = fmtDateMDY(line.endIso);
  const endTime = fmtTimeHMSAmPm(line.endIso);
  if (!beginDate || !beginTime || !endDate || !endTime) return null;

  const begin = parseUsAddress(line.beginAddress);
  const end = parseUsAddress(line.endAddress);

  return [
    csvEscape(line.memberId),
    csvEscape(line.firstName),
    "",
    csvEscape(line.lastName),
    csvEscape(line.serviceCode),
    csvEscape(line.serviceDescription),
    csvEscape(line.providerId),
    csvEscape(line.employeeName),
    csvEscape(beginDate),
    csvEscape(beginTime),
    csvEscape(begin.street),
    "", // Begin Apt/Suite/Floor
    csvEscape(begin.city),
    csvEscape(begin.state),
    csvEscape(begin.zip),
    line.beginLat != null ? String(line.beginLat) : "",
    line.beginLng != null ? String(line.beginLng) : "",
    csvEscape(endDate),
    csvEscape(endTime),
    csvEscape(end.street),
    "", // End Address2
    csvEscape(end.city),
    csvEscape(end.state),
    csvEscape(end.zip),
    line.endLat != null ? String(line.endLat) : "",
    line.endLng != null ? String(line.endLng) : "",
    csvEscape(line.origReceiptId),
    String(batchNumber),
    String(recordId),
    csvEscape(line.vendor),
  ].join(",");
}

/**
 * Build a complete CSV string. Lines with invalid timestamps are silently
 * dropped (counted in skippedCount). The caller should pre-validate with
 * isValidIso and exclude rows from DB inserts before calling this, but this
 * acts as a safety net for any that slip through.
 */
export function buildUtahCsv(lines: UtahExportLine[], batchNumber: number): { csv: string; skippedCount: number } {
  let skippedCount = 0;
  let recordId = 0;
  const rows: string[] = [];
  for (const line of lines) {
    const row = buildUtahCsvLine(line, recordId + 1, batchNumber);
    if (row === null) {
      skippedCount += 1;
    } else {
      recordId += 1;
      rows.push(row);
    }
  }
  return {
    csv: [UTAH_30_HEADER, ...rows].join("\r\n"),
    skippedCount,
  };
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
