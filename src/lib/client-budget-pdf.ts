// Client-side monthly budget PDF generator. pdf-lib (Worker-safe, no
// canvas / native deps). Reads only literal values passed in — never
// fabricates. Empty fields render as "—".
//
// Reused by:
//   • Download PDF / Print buttons (ClientBudgetPanel)
//   • Ship to client file (uploads the same bytes to client-documents)
//   • deferred "Email budget" action (will attach the same bytes)

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from "pdf-lib";

export type BudgetPdfLine = {
  label: string;
  non_variable: number;
  variable: number;
  notes: string | null;
  day_of_month: number | null;
};

export type BudgetPdfLogo = { bytes: Uint8Array; mime: string };

export type BudgetPdfPayload = {
  orgName: string;
  logo?: BudgetPdfLogo | null;
  clientName: string;
  periodLabel: string; // e.g. "July 2026"
  details: string;
  income: BudgetPdfLine[];
  expense: BudgetPdfLine[];
  other: BudgetPdfLine[];
};

// ── Layout constants ─────────────────────────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 48;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 54;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const COL = {
  day: 32,
  label: 156,
  nonVar: 66,
  variable: 66,
  total: 70,
  notes: 126,
};

// Muted, editorial palette. Neutral grays with a single accent for the
// difference tile — nothing here reads like a promo poster.
const C = {
  ink: rgb(0.09, 0.09, 0.11),
  text: rgb(0.16, 0.17, 0.20),
  muted: rgb(0.42, 0.44, 0.48),
  faint: rgb(0.62, 0.64, 0.68),
  rule: rgb(0.82, 0.83, 0.86),
  ruleSoft: rgb(0.90, 0.91, 0.93),
  zebra: rgb(0.973, 0.976, 0.98),
  band: rgb(0.94, 0.95, 0.97),
  accent: rgb(0.11, 0.30, 0.55),      // deep navy
  positive: rgb(0.02, 0.42, 0.24),    // subdued green
  danger: rgb(0.62, 0.14, 0.20),      // subdued red
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

function colXs() {
  const day = MARGIN_X;
  const label = day + COL.day;
  const nonVar = label + COL.label;
  const variable = nonVar + COL.nonVar;
  const total = variable + COL.variable;
  const notes = total + COL.total;
  return { day, label, nonVar, variable, total, notes };
}

export async function renderClientBudgetPdf(p: BudgetPdfPayload): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Monthly Budget — ${p.clientName} — ${p.periodLabel}`);
  doc.setAuthor(p.orgName || "HIVE");
  doc.setCreator("HIVE");
  doc.setProducer("HIVE");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let logoImg: PDFImage | null = null;
  if (p.logo && p.logo.bytes && p.logo.bytes.byteLength > 0) {
    try {
      logoImg = p.logo.mime.includes("png")
        ? await doc.embedPng(p.logo.bytes)
        : await doc.embedJpg(p.logo.bytes);
    } catch {
      logoImg = null; // silent fallback to name-only header
    }
  }

  const generatedAt = new Date();
  const footerText =
    `Financial support provided by ${p.orgName || "the provider"}. ` +
    `This is a monthly budget statement — not a PBA trust document.`;

  const pageInfos: PDFPage[] = [];
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  pageInfos.push(page);
  let y = PAGE_H - MARGIN_TOP;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageInfos.push(page);
    y = PAGE_H - MARGIN_TOP;
    drawRunningHeader();
  };
  const ensure = (need: number) => {
    if (y - need < MARGIN_BOTTOM) newPage();
  };

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(text, {
      x, y: yPos,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? C.text,
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
    drawText(text, xRight - f.widthOfTextAtSize(text, size), yPos, opts);
  };
  const drawCentered = (
    text: string,
    xLeft: number,
    width: number,
    yPos: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const size = opts.size ?? 10;
    const f = opts.font ?? font;
    const w = f.widthOfTextAtSize(text, size);
    drawText(text, xLeft + (width - w) / 2, yPos, opts);
  };

  // ── Page 1 header ────────────────────────────────────────────────────────
  const headerBottom = drawTitleHeader();
  y = headerBottom - 18;

  function drawTitleHeader(): number {
    // Logo (left) or org name; title block right-aligned.
    const headerTop = PAGE_H - MARGIN_TOP;
    let logoBottom = headerTop - 40;

    if (logoImg) {
      const maxH = 44;
      const maxW = 180;
      const scale = Math.min(maxH / logoImg.height, maxW / logoImg.width, 1);
      const w = logoImg.width * scale;
      const h = logoImg.height * scale;
      page.drawImage(logoImg, { x: MARGIN_X, y: headerTop - h, width: w, height: h });
      logoBottom = headerTop - h;
    } else {
      page.drawText(p.orgName || "Organization", {
        x: MARGIN_X, y: headerTop - 14,
        size: 16, font: bold, color: C.ink,
      });
    }

    // Right side: title + subtitle
    const titleY = headerTop - 4;
    drawRight("MONTHLY BUDGET STATEMENT", PAGE_W - MARGIN_X, titleY, {
      size: 11, font: bold, color: C.muted,
    });
    drawRight(p.clientName || "—", PAGE_W - MARGIN_X, titleY - 22, {
      size: 18, font: bold, color: C.ink,
    });
    drawRight(`Period: ${p.periodLabel}`, PAGE_W - MARGIN_X, titleY - 40, {
      size: 10.5, color: C.text,
    });
    drawRight(
      `Prepared: ${generatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      PAGE_W - MARGIN_X, titleY - 54, { size: 9, color: C.muted },
    );

    // Divider bar with accent nib
    const barY = Math.min(logoBottom, titleY - 66) - 10;
    page.drawRectangle({ x: MARGIN_X, y: barY, width: 36, height: 3, color: C.accent });
    page.drawRectangle({ x: MARGIN_X + 36, y: barY + 1, width: CONTENT_W - 36, height: 1, color: C.rule });
    return barY;
  }

  function drawRunningHeader() {
    drawText(p.orgName || "Organization", MARGIN_X, PAGE_H - MARGIN_TOP + 6, {
      size: 8.5, font: bold, color: C.muted,
    });
    drawRight(
      `${p.clientName} — Monthly Budget — ${p.periodLabel}`,
      PAGE_W - MARGIN_X, PAGE_H - MARGIN_TOP + 6,
      { size: 8.5, color: C.muted },
    );
    page.drawLine({
      start: { x: MARGIN_X, y: PAGE_H - MARGIN_TOP - 2 },
      end: { x: PAGE_W - MARGIN_X, y: PAGE_H - MARGIN_TOP - 2 },
      thickness: 0.4, color: C.rule,
    });
    y = PAGE_H - MARGIN_TOP - 14;
  }

  // ── Section renderer ─────────────────────────────────────────────────────
  const xs = colXs();
  const HEADER_ROW_H = 16;
  const ROW_LINE_H = 12;

  const drawColumnHeaders = () => {
    // Draw the header row strictly BELOW the current y cursor so it can
    // never overlap whatever was drawn just above (e.g. the section band).
    const top = y;
    const bottom = y - HEADER_ROW_H;
    const textY = bottom + 5;
    page.drawRectangle({ x: MARGIN_X, y: bottom, width: CONTENT_W, height: HEADER_ROW_H, color: C.band });
    page.drawLine({
      start: { x: MARGIN_X, y: top }, end: { x: PAGE_W - MARGIN_X, y: top },
      thickness: 0.5, color: C.rule,
    });
    page.drawLine({
      start: { x: MARGIN_X, y: bottom }, end: { x: PAGE_W - MARGIN_X, y: bottom },
      thickness: 0.5, color: C.rule,
    });
    drawCentered("DAY", xs.day, COL.day, textY, { size: 8, font: bold, color: C.muted });
    drawText("DESCRIPTION", xs.label + 4, textY, { size: 8, font: bold, color: C.muted });
    drawRight("NON-VAR", xs.nonVar + COL.nonVar - 4, textY, { size: 8, font: bold, color: C.muted });
    drawRight("VARIABLE", xs.variable + COL.variable - 4, textY, { size: 8, font: bold, color: C.muted });
    drawRight("TOTAL", xs.total + COL.total - 4, textY, { size: 8, font: bold, color: C.muted });
    drawText("NOTES", xs.notes + 4, textY, { size: 8, font: bold, color: C.muted });
    y = bottom;
  };

  const drawSection = (title: string, rows: BudgetPdfLine[]) => {
    ensure(HEADER_ROW_H + 40);

    // Section title band with subtotal on the right. Band sits BELOW the
    // current y; then we drop y by band height plus an explicit gap so
    // the column-header row cannot collide with the band.
    const sub = sectionTotal(rows);
    const bandFontSize = 10.5;
    const bandH = 24;
    const bandBottom = y - bandH;
    // Vertically center the text within the band using the font's true
    // glyph height (pdf-lib's y is the baseline).
    const glyphH = bold.heightAtSize(bandFontSize);
    const bandTextY = bandBottom + (bandH - glyphH) / 2 + 1;

    page.drawRectangle({
      x: MARGIN_X, y: bandBottom,
      width: CONTENT_W, height: bandH, color: C.ink,
    });
    drawText(title.toUpperCase(), MARGIN_X + 12, bandTextY, {
      size: bandFontSize, font: bold, color: rgb(1, 1, 1),
    });
    drawRight(`Subtotal  ${fmt$(sub)}`, PAGE_W - MARGIN_X - 12, bandTextY, {
      size: bandFontSize, font: bold, color: rgb(1, 1, 1),
    });
    y = bandBottom - 8; // clean gap between band and column-header row


    drawColumnHeaders();


    const sortedRows = [...rows].sort((a, b) => {
      const ad = a.day_of_month ?? 99;
      const bd = b.day_of_month ?? 99;
      return ad - bd;
    });

    if (sortedRows.length === 0) {
      const emptyH = 18;
      drawText("— no lines recorded —", MARGIN_X + 8, y - 12, { size: 9.5, font: italic, color: C.faint });
      y -= emptyH;
    } else {
      sortedRows.forEach((l, idx) => {
        const labelLines = wrap(font, l.label || "—", 9.5, COL.label - 8);
        const notesLines = wrap(font, l.notes || "—", 8.5, COL.notes - 8);
        const rowLines = Math.max(labelLines.length, notesLines.length);
        const rowH = rowLines * ROW_LINE_H + 6;

        if (y - rowH < MARGIN_BOTTOM) {
          newPage();
          drawColumnHeaders();
        }

        // Zebra shading for readability
        if (idx % 2 === 1) {
          page.drawRectangle({
            x: MARGIN_X, y: y - rowH + 2,
            width: CONTENT_W, height: rowH, color: C.zebra,
          });
        }

        const rowTextY = y - 10;
        const dayText = l.day_of_month != null ? String(l.day_of_month) : "—";
        drawCentered(dayText, xs.day, COL.day, rowTextY, { size: 9.5, color: C.text });
        labelLines.forEach((ln, i) =>
          drawText(ln, xs.label + 4, rowTextY - i * ROW_LINE_H, { size: 9.5, color: C.text }),
        );
        drawRight(fmt$(Number(l.non_variable || 0)), xs.nonVar + COL.nonVar - 4, rowTextY, { size: 9.5, color: C.text });
        drawRight(fmt$(Number(l.variable || 0)), xs.variable + COL.variable - 4, rowTextY, { size: 9.5, color: C.text });
        drawRight(fmt$(lineTotal(l)), xs.total + COL.total - 4, rowTextY, { size: 9.5, font: bold, color: C.ink });
        notesLines.forEach((ln, i) =>
          drawText(ln, xs.notes + 4, rowTextY - i * ROW_LINE_H, { size: 8.5, color: C.muted }),
        );

        y -= rowH;
        page.drawLine({
          start: { x: MARGIN_X, y: y + 2 },
          end: { x: PAGE_W - MARGIN_X, y: y + 2 },
          thickness: 0.25, color: C.ruleSoft,
        });
      });
    }

    // (Subtotal already shown in the section band — no duplicate row here.)
    y -= 14; // breathing room between sections
  };


  drawSection("Income", p.income);
  drawSection("Expenses / Needs", p.expense);
  drawSection("Other Needs / Wants / Activities / Savings", p.other);

  // ── Summary block ────────────────────────────────────────────────────────
  const tIncome = sectionTotal(p.income);
  const tExpense = sectionTotal(p.expense);
  const tOther = sectionTotal(p.other);
  const diff = tIncome - tExpense - tOther;

  ensure(96);
  page.drawLine({
    start: { x: MARGIN_X, y }, end: { x: PAGE_W - MARGIN_X, y },
    thickness: 0.75, color: C.ink,
  });
  y -= 14;
  drawText("SUMMARY", MARGIN_X, y, { size: 10, font: bold, color: C.muted });
  y -= 14;

  const tileH = 52;
  const gap = 8;
  const tileW = (CONTENT_W - gap * 3) / 4;
  const tileY = y - tileH;

  const summaryTiles: Array<{ label: string; value: number; color: ReturnType<typeof rgb>; emphasize?: boolean }> = [
    { label: "Total Income",   value: tIncome,  color: C.positive },
    { label: "Total Expenses", value: tExpense, color: C.danger },
    { label: "Total Other",    value: tOther,   color: C.danger },
    { label: "Difference",     value: diff,     color: diff >= 0 ? C.positive : C.danger, emphasize: true },
  ];

  summaryTiles.forEach((t, i) => {
    const x = MARGIN_X + i * (tileW + gap);
    if (t.emphasize) {
      page.drawRectangle({ x, y: tileY, width: tileW, height: tileH, color: t.color });
      drawText(t.label.toUpperCase(), x + 10, tileY + tileH - 14, {
        size: 8, font: bold, color: rgb(1, 1, 1),
      });
      drawText(fmt$(t.value), x + 10, tileY + 14, {
        size: 18, font: bold, color: rgb(1, 1, 1),
      });
    } else {
      page.drawRectangle({
        x, y: tileY, width: tileW, height: tileH,
        borderColor: C.rule, borderWidth: 0.6,
      });
      drawText(t.label.toUpperCase(), x + 10, tileY + tileH - 14, {
        size: 8, font: bold, color: C.muted,
      });
      drawText(fmt$(t.value), x + 10, tileY + 14, {
        size: 14, font: bold, color: t.color,
      });
    }
  });
  y = tileY - 18;

  // ── Details narrative ────────────────────────────────────────────────────
  const detailText = p.details && p.details.trim() ? p.details.trim() : "";
  if (detailText) {
    ensure(40);
    drawText("DETAILS / NARRATIVE", MARGIN_X, y, { size: 10, font: bold, color: C.muted });
    y -= 4;
    page.drawLine({
      start: { x: MARGIN_X, y: y - 2 },
      end: { x: MARGIN_X + 80, y: y - 2 },
      thickness: 0.75, color: C.accent,
    });
    y -= 12;
    const paragraphs = detailText.split(/\n+/);
    for (const para of paragraphs) {
      const lines = wrap(font, para, 10, CONTENT_W);
      for (const ln of lines) {
        ensure(14);
        drawText(ln, MARGIN_X, y, { size: 10, color: C.text });
        y -= 13;
      }
      y -= 4;
    }
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const totalPages = pageInfos.length;
  pageInfos.forEach((pg, i) => {
    const stampY = MARGIN_BOTTOM - 22;
    // top rule
    pg.drawLine({
      start: { x: MARGIN_X, y: stampY + 22 },
      end: { x: PAGE_W - MARGIN_X, y: stampY + 22 },
      thickness: 0.4, color: C.rule,
    });
    // Left: disclaimer
    pg.drawText(footerText, {
      x: MARGIN_X, y: stampY + 10, size: 8, font, color: C.muted,
    });
    // Left small: timestamp
    pg.drawText(`Generated ${generatedAt.toLocaleString()}`, {
      x: MARGIN_X, y: stampY - 2, size: 7.5, font, color: C.faint,
    });
    // Right: page number
    const pageLabel = `Page ${i + 1} of ${totalPages}`;
    const w = bold.widthOfTextAtSize(pageLabel, 8);
    pg.drawText(pageLabel, {
      x: PAGE_W - MARGIN_X - w, y: stampY + 10,
      size: 8, font: bold, color: C.muted,
    });
  });

  return await doc.save();
}

export function budgetPdfFilename(clientName: string, periodLabel: string): string {
  const safe = (s: string) => s.replace(/[^\w\d]+/g, "_").replace(/^_+|_+$/g, "");
  return `budget_${safe(clientName)}_${safe(periodLabel)}.pdf`;
}
