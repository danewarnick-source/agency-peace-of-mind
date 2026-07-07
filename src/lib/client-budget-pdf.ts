// Client-side monthly budget PDF generator. Uses pdf-lib (Worker-safe, no
// canvas or native deps). Reads only literal values passed in — never
// fabricates. Empty fields render as "—". Reused by the Download PDF button
// and (later) the deferred "Email budget" action so the same document is
// what's saved, printed, and emailed.

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";

export type BudgetPdfLine = {
  label: string;
  non_variable: number;
  variable: number;
  notes: string | null;
};

export type BudgetPdfPayload = {
  clientName: string;
  periodLabel: string; // e.g. "July 2026"
  details: string;
  income: BudgetPdfLine[];
  expense: BudgetPdfLine[];
  other: BudgetPdfLine[];
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Column widths (sum = CONTENT_W = 516)
const COL = {
  label: 180,
  nonVar: 70,
  variable: 70,
  total: 70,
  notes: 126,
};

const COLORS = {
  text: rgb(0.09, 0.09, 0.11),
  muted: rgb(0.4, 0.4, 0.45),
  line: rgb(0.82, 0.82, 0.85),
  headerBg: rgb(0.95, 0.95, 0.97),
  positive: rgb(0.02, 0.5, 0.28),
  danger: rgb(0.72, 0.11, 0.24),
};

function fmt$(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function lineTotal(l: BudgetPdfLine): number {
  return Number(l.non_variable || 0) + Number(l.variable || 0);
}
function sectionTotal(rows: BudgetPdfLine[]): number {
  return rows.reduce((a, l) => a + lineTotal(l), 0);
}

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const attempt = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(attempt, size) > maxW && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = attempt;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export async function renderClientBudgetPdf(p: BudgetPdfPayload): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Monthly Budget — ${p.clientName} — ${p.periodLabel}`);
  doc.setCreator("HIVE");
  doc.setProducer("HIVE");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensure = (need: number) => {
    if (y - need < MARGIN + 24) {
      // footer on outgoing page
      drawFooter(page, font);
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? COLORS.text,
    });
  };

  const drawRight = (
    text: string,
    xRight: number,
    yPos: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const size = opts.size ?? 10;
    const f = opts.font ?? font;
    const w = f.widthOfTextAtSize(text, size);
    drawText(text, xRight - w, yPos, opts);
  };

  const hr = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: COLORS.line,
    });
    y -= 10;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  drawText("Monthly Budget", MARGIN, y, { size: 20, font: bold });
  y -= 22;
  drawText(p.clientName || "—", MARGIN, y, { size: 13, font: bold });
  y -= 16;
  drawText(`Period: ${p.periodLabel}`, MARGIN, y, { size: 11, color: COLORS.muted });
  y -= 14;
  hr();

  // ── Section renderer ──────────────────────────────────────────────────────
  const drawSection = (title: string, rows: BudgetPdfLine[]) => {
    ensure(40);
    drawText(title, MARGIN, y, { size: 12, font: bold });
    y -= 14;

    // Header row background
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: CONTENT_W,
      height: 16,
      color: COLORS.headerBg,
    });
    const xs = colXs();
    drawText("Label", xs.label + 4, y, { size: 9, font: bold, color: COLORS.muted });
    drawRight("Non-Var", xs.nonVar + COL.nonVar - 4, y, { size: 9, font: bold, color: COLORS.muted });
    drawRight("Variable", xs.variable + COL.variable - 4, y, { size: 9, font: bold, color: COLORS.muted });
    drawRight("Total", xs.total + COL.total - 4, y, { size: 9, font: bold, color: COLORS.muted });
    drawText("Notes", xs.notes + 4, y, { size: 9, font: bold, color: COLORS.muted });
    y -= 14;

    if (rows.length === 0) {
      drawText("— no lines —", MARGIN + 4, y, { size: 10, color: COLORS.muted });
      y -= 14;
    } else {
      for (const l of rows) {
        const labelLines = wrap(font, l.label || "—", 10, COL.label - 8);
        const notesLines = wrap(font, l.notes || "—", 9, COL.notes - 8);
        const rowLines = Math.max(labelLines.length, notesLines.length);
        const rowH = rowLines * 12 + 4;
        ensure(rowH + 4);

        labelLines.forEach((ln, i) => drawText(ln, xs.label + 4, y - i * 12, { size: 10 }));
        drawRight(fmt$(Number(l.non_variable || 0)), xs.nonVar + COL.nonVar - 4, y, { size: 10 });
        drawRight(fmt$(Number(l.variable || 0)), xs.variable + COL.variable - 4, y, { size: 10 });
        drawRight(fmt$(lineTotal(l)), xs.total + COL.total - 4, y, { size: 10, font: bold });
        notesLines.forEach((ln, i) =>
          drawText(ln, xs.notes + 4, y - i * 12, { size: 9, color: COLORS.muted }),
        );
        y -= rowH;
        page.drawLine({
          start: { x: MARGIN, y: y + 2 },
          end: { x: PAGE_W - MARGIN, y: y + 2 },
          thickness: 0.25,
          color: COLORS.line,
        });
      }
    }

    // Subtotal
    ensure(20);
    const sub = sectionTotal(rows);
    drawText("Subtotal", xs.total - 60, y, { size: 10, font: bold, color: COLORS.muted });
    drawRight(fmt$(sub), xs.total + COL.total - 4, y, { size: 11, font: bold });
    y -= 18;
  };

  drawSection("Income", p.income);
  drawSection("Expenses / Needs", p.expense);
  drawSection("Other Needs / Wants / Activities / Savings", p.other);

  // ── Totals block ──────────────────────────────────────────────────────────
  ensure(90);
  hr();
  const tIncome = sectionTotal(p.income);
  const tExpense = sectionTotal(p.expense);
  const tOther = sectionTotal(p.other);
  const diff = tIncome - tExpense - tOther;

  drawText("Totals", MARGIN, y, { size: 12, font: bold });
  y -= 16;

  const tileW = (CONTENT_W - 12) / 4;
  const tileY = y - 44;
  const tiles: Array<{ label: string; value: number; color?: ReturnType<typeof rgb>; emphasize?: boolean }> = [
    { label: "Total Income", value: tIncome, color: COLORS.positive },
    { label: "Total Expenses", value: tExpense, color: COLORS.danger },
    { label: "Total Other", value: tOther, color: COLORS.danger },
    { label: "Difference", value: diff, color: diff >= 0 ? COLORS.positive : COLORS.danger, emphasize: true },
  ];
  tiles.forEach((t, i) => {
    const x = MARGIN + i * (tileW + 4);
    page.drawRectangle({
      x, y: tileY, width: tileW, height: 44,
      borderColor: t.emphasize ? t.color! : COLORS.line,
      borderWidth: t.emphasize ? 1.5 : 0.5,
    });
    drawText(t.label.toUpperCase(), x + 8, tileY + 30, { size: 8, color: COLORS.muted, font: bold });
    drawText(fmt$(t.value), x + 8, tileY + 12, {
      size: t.emphasize ? 15 : 12,
      font: bold,
      color: t.color,
    });
  });
  y = tileY - 16;

  // ── Details narrative ─────────────────────────────────────────────────────
  ensure(40);
  hr();
  drawText("Details / narrative", MARGIN, y, { size: 12, font: bold });
  y -= 14;
  const detailText = p.details && p.details.trim() ? p.details.trim() : "—";
  const paragraphs = detailText.split(/\n+/);
  for (const para of paragraphs) {
    const lines = wrap(font, para, 10, CONTENT_W);
    for (const ln of lines) {
      ensure(14);
      drawText(ln, MARGIN, y, { size: 10 });
      y -= 12;
    }
    y -= 4;
  }

  drawFooter(page, font);

  return await doc.save();
}

function colXs() {
  const x0 = MARGIN;
  const label = x0;
  const nonVar = label + COL.label;
  const variable = nonVar + COL.nonVar;
  const total = variable + COL.variable;
  const notes = total + COL.total;
  return { label, nonVar, variable, total, notes };
}

function drawFooter(page: PDFPage, font: PDFFont) {
  const text = `Generated ${new Date().toLocaleString()}  •  HIVE`;
  page.drawText(text, {
    x: MARGIN,
    y: MARGIN / 2,
    size: 8,
    font,
    color: COLORS.muted,
  });
}

export function budgetPdfFilename(clientName: string, periodLabel: string): string {
  const safe = (s: string) => s.replace(/[^\w\d]+/g, "_").replace(/^_+|_+$/g, "");
  return `budget_${safe(clientName)}_${safe(periodLabel)}.pdf`;
}
