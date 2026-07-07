// Chore-chart printable PDF. pdf-lib (Worker-safe). Renders the physical
// chart providers post in the home: task-definition key + every-day chores
// + client rotation grid. Reads only literal values passed in — never
// fabricates.

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";

export type ChoreDef = { id: string; chore_name: string; task_list: string };
export type ChoreClientCell = {
  clientId: string;
  day: number; // 0=Mon..6=Sun
  definitionName: string | null;
  isFreeDay: boolean;
  note: string | null;
};
export type ChoreOutcomeTotals = {
  completed: number;
  completed_with_support: number;
  offered_declined: number;
  not_addressed: number;
};
export type ChoreClient = {
  id: string;
  name: string;
  /** When populated, activation reason for this client's chore tracking. */
  supportReason?: "pcsp_goal" | "intake_need" | "manual" | null;
  supportNote?: string | null;
  /** Optional per-client outcome tallies for the week covered by weekStartISO. */
  outcomes?: ChoreOutcomeTotals | null;
};
export type ChoreDailyItem = { label: string; detail: string | null };

export type ChoreChartPdfPayload = {
  orgName: string;
  spaceName: string;
  spaceType: string;
  clients: ChoreClient[];
  definitions: ChoreDef[];
  clientCells: ChoreClientCell[];
  /** Chores every client does every day (personal hygiene, beds, hamper, etc). */
  dailyItems?: ChoreDailyItem[];
  /** ISO date (YYYY-MM-DD) of the Monday that anchors this chart's week. */
  weekStartISO?: string;
  /** Space-wide outcome tallies for the week (from chore_completions). */
  weeklyOutcomeTotals?: ChoreOutcomeTotals | null;
};


const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PAGE_W = 792; // landscape US Letter
const PAGE_H = 612;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Parse YYYY-MM-DD as a local-noon date to avoid timezone drift. */
function parseISODateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function shortDate(d: Date): string {
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}
export function formatWeekRange(weekStartISO: string): string | null {
  const start = parseISODateLocal(weekStartISO);
  if (!start) return null;
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const yr = end.getFullYear();
  return sameMonth
    ? `Week of ${MONTHS_SHORT[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${yr}`
    : `Week of ${shortDate(start)} – ${shortDate(end)}, ${yr}`;
}
function dayDateLabels(weekStartISO?: string): (string | null)[] {
  const start = weekStartISO ? parseISODateLocal(weekStartISO) : null;
  if (!start) return [null, null, null, null, null, null, null];
  return [0, 1, 2, 3, 4, 5, 6].map((i) => shortDate(addDays(start, i)));
}

const C = {
  ink: rgb(0.09, 0.09, 0.11),
  text: rgb(0.18, 0.19, 0.22),
  muted: rgb(0.44, 0.46, 0.5),
  rule: rgb(0.8, 0.81, 0.84),
  ruleSoft: rgb(0.9, 0.91, 0.93),
  band: rgb(0.11, 0.30, 0.55),
  bandText: rgb(1, 1, 1),
  zebra: rgb(0.97, 0.975, 0.98),
  free: rgb(0.94, 0.97, 0.94),
};

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(trial, size) > maxW && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb> },
) {
  page.drawText(text, {
    x,
    y,
    font: opts.font,
    size: opts.size,
    color: opts.color ?? C.text,
  });
}

export async function renderChoreChartPdf(p: ChoreChartPdfPayload): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  // Header
  const weekRange = p.weekStartISO ? formatWeekRange(p.weekStartISO) : null;
  const dateLabels = dayDateLabels(p.weekStartISO);
  drawText(page, p.orgName || "Organization", MARGIN, y - 12, { font: bold, size: 10, color: C.muted });
  drawText(page, `Cleaning Chart — ${p.spaceName}`, MARGIN, y - 30, { font: bold, size: 18, color: C.ink });
  const typeLabel = p.spaceType.toUpperCase();
  drawText(page, typeLabel, MARGIN, y - 46, { font, size: 9, color: C.muted });
  if (weekRange) {
    const typeW = font.widthOfTextAtSize(typeLabel, 9);
    drawText(page, `  ·  ${weekRange}`, MARGIN + typeW, y - 46, {
      font: bold, size: 9, color: C.ink,
    });
  }
  const today = new Date().toLocaleDateString();
  const todayW = font.widthOfTextAtSize(today, 9);
  drawText(page, today, PAGE_W - MARGIN - todayW, y - 12, { font, size: 9, color: C.muted });
  y -= 62;

  // ── Task definition key ────────────────────────────────
  page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 18, color: C.band });
  drawText(page, "TASK KEY  ·  what each chore includes", MARGIN + 8, y - 13, {
    font: bold, size: 9, color: C.bandText,
  });
  y -= 22;

  const keyCol1 = MARGIN + 8;
  const keyCol2 = MARGIN + 140;
  const keyRowW = CONTENT_W - 8;

  if (p.definitions.length === 0) {
    drawText(page, "No chore definitions yet.", keyCol1, y - 10, { font, size: 9, color: C.muted });
    y -= 16;
  } else {
    for (const d of p.definitions) {
      const wrapped = wrap(font, d.task_list || "—", 8.5, keyRowW - 140);
      const rowH = Math.max(14, wrapped.length * 11 + 4);
      if (y - rowH < MARGIN + 40) newPage();
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: MARGIN + CONTENT_W, y },
        color: C.ruleSoft, thickness: 0.5,
      });
      drawText(page, d.chore_name, keyCol1, y - 11, { font: bold, size: 9, color: C.ink });
      wrapped.forEach((ln, i) => {
        drawText(page, ln, keyCol2, y - 11 - i * 11, { font, size: 8.5, color: C.text });
      });
      y -= rowH;
    }
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y },
      color: C.rule, thickness: 0.5,
    });
  }
  y -= 14;

  // ── Every-day chores band ───────────────────────────────
  const dailyList = p.dailyItems ?? [];
  if (dailyList.length > 0) {
    if (y - 40 < MARGIN + 20) newPage();
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 18, color: C.band });
    drawText(page, "EVERY DAY  ·  all clients, every day", MARGIN + 8, y - 13, {
      font: bold, size: 9, color: C.bandText,
    });
    y -= 22;
    // Two-column layout of labels + optional detail lines
    const colW = CONTENT_W;
    const innerX = MARGIN + 8;
    const wrapW = colW - 16;
    for (const item of dailyList) {
      const detailLines = item.detail ? wrap(font, item.detail, 8.5, wrapW - 130) : [];
      const rowH = Math.max(14, detailLines.length * 10 + 4);
      if (y - rowH < MARGIN + 40) newPage();
      page.drawLine({
        start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y },
        color: C.ruleSoft, thickness: 0.4,
      });
      // Checkbox for the physical posted chart
      page.drawRectangle({
        x: innerX, y: y - 12, width: 8, height: 8,
        borderColor: C.rule, borderWidth: 0.6,
      });
      drawText(page, item.label, innerX + 14, y - 11, { font: bold, size: 9, color: C.ink });
      detailLines.forEach((ln, i) => {
        drawText(page, ln, innerX + 130, y - 11 - i * 10, { font, size: 8.5, color: C.text });
      });
      y -= rowH;
    }
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y },
      color: C.rule, thickness: 0.5,
    });
    y -= 14;
  }

  // ── Client rotation grid ───────────────────────────────
  const drawGrid = (
    title: string,
    rowLabels: { key: string; label: string; sub: string | null }[],
    cellFor: (rowKey: string, day: number) => { text: string; sub: string | null; isFree: boolean },
  ) => {
    if (y - 60 < MARGIN + 20) newPage();
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 18, color: C.band });
    drawText(page, title, MARGIN + 8, y - 13, { font: bold, size: 9, color: C.bandText });
    if (weekRange) {
      const wrW = font.widthOfTextAtSize(weekRange, 8.5);
      drawText(page, weekRange, MARGIN + CONTENT_W - 8 - wrW, y - 13, {
        font: bold, size: 8.5, color: C.bandText,
      });
    }
    y -= 22;

    const labelColW = 120;
    const dayColW = (CONTENT_W - labelColW) / 7;
    const hasDates = dateLabels.some((d) => d !== null);
    const headerH = hasDates ? 24 : 14;
    // Header row (weekday + optional date)
    DAYS.forEach((d, i) => {
      drawText(page, d, MARGIN + labelColW + i * dayColW + 6, y - 10, {
        font: bold, size: 8.5, color: C.muted,
      });
      const dl = dateLabels[i];
      if (dl) {
        drawText(page, dl, MARGIN + labelColW + i * dayColW + 6, y - 20, {
          font, size: 7.5, color: C.muted,
        });
      }
    });
    y -= headerH;
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y },
      color: C.rule, thickness: 0.5,
    });

    rowLabels.forEach((row, ri) => {
      const cellsWrapped = [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const c = cellFor(row.key, d);
        const mainLines = wrap(font, c.text, 8, dayColW - 8);
        const subLines = c.sub ? wrap(font, c.sub, 7, dayColW - 8) : [];
        return { c, mainLines, subLines };
      });
      const rowH = Math.max(
        30,
        Math.max(...cellsWrapped.map((w) => w.mainLines.length * 9 + w.subLines.length * 8)) + 10,
      );
      if (y - rowH < MARGIN + 20) newPage();

      if (ri % 2 === 0) {
        page.drawRectangle({
          x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: C.zebra,
        });
      }
      // row label
      drawText(page, row.label, MARGIN + 6, y - 12, { font: bold, size: 9, color: C.ink });
      if (row.sub) {
        drawText(page, row.sub, MARGIN + 6, y - 22, { font, size: 7.5, color: C.muted });
      }
      // day cells
      cellsWrapped.forEach(({ c, mainLines, subLines }, d) => {
        const cx = MARGIN + labelColW + d * dayColW;
        if (c.isFree) {
          page.drawRectangle({
            x: cx + 2, y: y - rowH + 2, width: dayColW - 4, height: rowH - 4, color: C.free,
          });
        }
        mainLines.forEach((ln, i) => {
          drawText(page, ln, cx + 4, y - 12 - i * 9, {
            font: c.isFree ? font : bold, size: 8, color: C.ink,
          });
        });
        subLines.forEach((ln, i) => {
          drawText(page, ln, cx + 4, y - 12 - mainLines.length * 9 - i * 8, {
            font, size: 7, color: C.muted,
          });
        });
        // vertical rule
        page.drawLine({
          start: { x: cx, y: y }, end: { x: cx, y: y - rowH },
          color: C.ruleSoft, thickness: 0.4,
        });
      });
      // right border
      page.drawLine({
        start: { x: MARGIN + CONTENT_W, y }, end: { x: MARGIN + CONTENT_W, y: y - rowH },
        color: C.ruleSoft, thickness: 0.4,
      });
      // label col divider
      page.drawLine({
        start: { x: MARGIN + labelColW, y }, end: { x: MARGIN + labelColW, y: y - rowH },
        color: C.rule, thickness: 0.5,
      });
      y -= rowH;
      page.drawLine({
        start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y },
        color: C.ruleSoft, thickness: 0.4,
      });
    });
    y -= 14;
  };

  drawGrid(
    "CLIENT ROTATION",
    p.clients.map((c) => ({ key: c.id, label: c.name, sub: null })),
    (rowKey, day) => {
      const cell = p.clientCells.find((c) => c.clientId === rowKey && c.day === day);
      if (!cell) return { text: "—", sub: null, isFree: false };
      if (cell.isFreeDay) return { text: "Free day", sub: cell.note, isFree: true };
      return { text: cell.definitionName ?? "—", sub: cell.note, isFree: false };
    },
  );




  // Footer page numbers
  const pageCount = pdf.getPageCount();
  pdf.getPages().forEach((pg, i) => {
    const label = `Page ${i + 1} of ${pageCount}`;
    const w = font.widthOfTextAtSize(label, 8);
    pg.drawText(label, {
      x: PAGE_W - MARGIN - w, y: MARGIN / 2, font, size: 8, color: C.muted,
    });
  });

  return pdf.save();
}
