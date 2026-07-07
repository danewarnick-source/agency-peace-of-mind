// Client-side meal-plan PDF generators. pdf-lib (Worker-safe).
// Two exports:
//   • renderMealPlanPdf       — landscape weekly menu grid + shopping list + preferences
//   • renderPlanVsActualPdf   — portrait plan-vs-actual table for a chosen week
// Both consume literal values only — never fabricates. Empty cells → "—".
// Styling mirrors the client-budget / chore-chart PDFs (logo header, accent
// nib, muted footer, page numbers).

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from "pdf-lib";

export type MealPlanLogo = { bytes: Uint8Array; mime: string };

export const DAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;
export const SLOT_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = typeof SLOT_ORDER[number];

export type MealPdfMeal = {
  day_of_week: number;      // 0=Mon..6=Sun
  meal_slot: MealSlot;
  label: string;
  description?: string | null;
  nutrition_value?: number | null;
  estimated_cost?: number | null;
};

export type MealPdfShoppingItem = {
  item: string;
  quantity?: string | null;
  checked?: boolean;
};

export type MealPlanPdfPayload = {
  orgName: string;
  logo?: MealPlanLogo | null;
  clientName: string;
  weekLabel: string;                // e.g. "Jul 6 – Jul 12, 2026"
  nutritionLabel: string;           // e.g. "Fat Grams"
  nutritionUnit: string;            // e.g. "g"
  meals: MealPdfMeal[];
  shopping: MealPdfShoppingItem[];
  foodLikes?: string | null;
  foodsToAvoid?: string | null;
  allergies?: string[] | null;
  dietaryNeeds?: string | null;
};

export type PlanActualRow = {
  day_of_week: number;              // 0=Mon..6=Sun
  meal_slot: MealSlot;
  date_iso: string;                 // YYYY-MM-DD
  planned: string;                  // joined planned labels or "—"
  outcome: string | null;           // human-readable outcome or null
  note: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;      // ISO
};

export type PlanVsActualPdfPayload = {
  orgName: string;
  logo?: MealPlanLogo | null;
  clientName: string;
  weekLabel: string;
  rows: PlanActualRow[];
};

// ── Shared palette ──────────────────────────────────────────────────────────
const C = {
  ink: rgb(0.09, 0.09, 0.11),
  text: rgb(0.16, 0.17, 0.20),
  muted: rgb(0.42, 0.44, 0.48),
  faint: rgb(0.62, 0.64, 0.68),
  rule: rgb(0.82, 0.83, 0.86),
  ruleSoft: rgb(0.90, 0.91, 0.93),
  zebra: rgb(0.973, 0.976, 0.98),
  band: rgb(0.94, 0.95, 0.97),
  accent: rgb(0.11, 0.30, 0.55),
  warn: rgb(0.62, 0.14, 0.20),
  soft: rgb(0.98, 0.97, 0.94),
};

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const attempt = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(attempt, size) > maxW && cur) {
      out.push(cur); cur = w;
    } else {
      cur = attempt;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Wrap that also breaks on very long unbroken tokens.
function wrapHard(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const soft = wrap(font, text ?? "", size, maxW);
  const out: string[] = [];
  for (const line of soft) {
    if (font.widthOfTextAtSize(line, size) <= maxW) { out.push(line); continue; }
    let cur = "";
    for (const ch of line) {
      if (font.widthOfTextAtSize(cur + ch, size) > maxW && cur) {
        out.push(cur); cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

async function embedLogo(doc: PDFDocument, logo?: MealPlanLogo | null): Promise<PDFImage | null> {
  if (!logo || !logo.bytes || logo.bytes.byteLength === 0) return null;
  try {
    return logo.mime.includes("png")
      ? await doc.embedPng(logo.bytes)
      : await doc.embedJpg(logo.bytes);
  } catch {
    return null;
  }
}

function drawHeader(opts: {
  page: PDFPage; bold: PDFFont; font: PDFFont; logoImg: PDFImage | null;
  orgName: string; title: string; clientName: string; subtitle: string; generatedAt: Date;
  pageW: number; marginX: number; marginTop: number;
}): number {
  const { page, bold, font, logoImg, orgName, title, clientName, subtitle, generatedAt, pageW, marginX, marginTop } = opts;
  const headerTop = page.getHeight() - marginTop;
  let logoBottom = headerTop - 40;
  if (logoImg) {
    const maxH = 44, maxW = 180;
    const scale = Math.min(maxH / logoImg.height, maxW / logoImg.width, 1);
    const w = logoImg.width * scale, h = logoImg.height * scale;
    page.drawImage(logoImg, { x: marginX, y: headerTop - h, width: w, height: h });
    logoBottom = headerTop - h;
  } else {
    page.drawText(orgName || "Organization", {
      x: marginX, y: headerTop - 14, size: 16, font: bold, color: C.ink,
    });
  }
  const titleY = headerTop - 4;
  const drawRight = (text: string, xR: number, y: number, size: number, f: PDFFont, color: ReturnType<typeof rgb>) => {
    page.drawText(text, { x: xR - f.widthOfTextAtSize(text, size), y, size, font: f, color });
  };
  drawRight(title, pageW - marginX, titleY, 11, bold, C.muted);
  drawRight(clientName || "—", pageW - marginX, titleY - 22, 18, bold, C.ink);
  drawRight(subtitle, pageW - marginX, titleY - 40, 10.5, font, C.text);
  drawRight(
    `Prepared: ${generatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    pageW - marginX, titleY - 54, 9, font, C.muted,
  );
  const barY = Math.min(logoBottom, titleY - 66) - 10;
  page.drawRectangle({ x: marginX, y: barY, width: 36, height: 3, color: C.accent });
  page.drawRectangle({ x: marginX + 36, y: barY + 1, width: (pageW - marginX * 2) - 36, height: 1, color: C.rule });
  return barY;
}

function drawFooter(opts: {
  pages: PDFPage[]; font: PDFFont; bold: PDFFont; generatedAt: Date; footerText: string;
  pageW: number; marginX: number; marginBottom: number;
}): void {
  const { pages, font, bold, generatedAt, footerText, pageW, marginX, marginBottom } = opts;
  const total = pages.length;
  pages.forEach((pg, i) => {
    const stampY = marginBottom - 22;
    pg.drawLine({
      start: { x: marginX, y: stampY + 22 },
      end: { x: pageW - marginX, y: stampY + 22 },
      thickness: 0.4, color: C.rule,
    });
    pg.drawText(footerText, { x: marginX, y: stampY + 10, size: 8, font, color: C.muted });
    pg.drawText(`Generated ${generatedAt.toLocaleString()}`, {
      x: marginX, y: stampY - 2, size: 7.5, font, color: C.faint,
    });
    const label = `Page ${i + 1} of ${total}`;
    const w = bold.widthOfTextAtSize(label, 8);
    pg.drawText(label, { x: pageW - marginX - w, y: stampY + 10, size: 8, font: bold, color: C.muted });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Weekly menu PDF (landscape 792 × 612)
// ═══════════════════════════════════════════════════════════════════════════
export async function renderMealPlanPdf(p: MealPlanPdfPayload): Promise<Uint8Array> {
  const PAGE_W = 792, PAGE_H = 612;
  const MARGIN_X = 40, MARGIN_TOP = 44, MARGIN_BOTTOM = 54;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  const doc = await PDFDocument.create();
  doc.setTitle(`Weekly Menu — ${p.clientName} — ${p.weekLabel}`);
  doc.setAuthor(p.orgName || "HIVE");
  doc.setCreator("HIVE");
  doc.setProducer("HIVE");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logoImg = await embedLogo(doc, p.logo);
  const generatedAt = new Date();
  const pages: PDFPage[] = [];

  // ── Page 1: header + weekly grid ─────────────────────────────────────────
  const page1 = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(page1);
  const p1Bottom = drawHeader({
    page: page1, bold, font, logoImg,
    orgName: p.orgName, title: "WEEKLY MENU",
    clientName: p.clientName, subtitle: `Week: ${p.weekLabel}`,
    generatedAt, pageW: PAGE_W, marginX: MARGIN_X, marginTop: MARGIN_TOP,
  });

  // Sub-subtitle strip: tracked-nutrition label
  let y = p1Bottom - 20;
  page1.drawText(`Tracked nutrition: ${p.nutritionLabel} (${p.nutritionUnit})`, {
    x: MARGIN_X, y, size: 9, font, color: C.muted,
  });
  y -= 12;

  // Grid: 7 day columns × (slot row + total row)
  const dayColW = CONTENT_W / 7;
  const slotLabelW = 68;
  const gridX = MARGIN_X;
  const gridTop = y - 4;
  const rowH = Math.floor((gridTop - MARGIN_BOTTOM - 26) / (SLOT_ORDER.length + 1));
  const gridBottom = gridTop - rowH * (SLOT_ORDER.length + 1);

  // Day header row
  const dayHeaderH = 22;
  page1.drawRectangle({
    x: gridX, y: gridTop - dayHeaderH, width: CONTENT_W, height: dayHeaderH, color: C.ink,
  });
  DAY_NAMES.forEach((d, i) => {
    const cx = gridX + i * dayColW;
    const size = 9.5;
    const w = bold.widthOfTextAtSize(d, size);
    page1.drawText(d, {
      x: cx + (dayColW - w) / 2, y: gridTop - dayHeaderH + (dayHeaderH - size) / 2 + 1,
      size, font: bold, color: rgb(1, 1, 1),
    });
    if (i > 0) {
      page1.drawLine({
        start: { x: cx, y: gridTop - dayHeaderH }, end: { x: cx, y: gridTop },
        thickness: 0.5, color: rgb(1, 1, 1),
      });
    }
  });

  // Slot rows
  const bodyTop = gridTop - dayHeaderH;
  const bodyRowH = Math.floor((bodyTop - MARGIN_BOTTOM - 24) / (SLOT_ORDER.length + 1));
  const bodyBottom = bodyTop - bodyRowH * (SLOT_ORDER.length + 1);

  // Zebra shading + slot labels on left of each row (overlaid as small pill)
  SLOT_ORDER.forEach((slot, r) => {
    const rowTop = bodyTop - r * bodyRowH;
    const rowBottom = rowTop - bodyRowH;
    if (r % 2 === 1) {
      page1.drawRectangle({
        x: gridX, y: rowBottom, width: CONTENT_W, height: bodyRowH, color: C.zebra,
      });
    }
    // Row border
    page1.drawLine({
      start: { x: gridX, y: rowBottom }, end: { x: gridX + CONTENT_W, y: rowBottom },
      thickness: 0.5, color: C.rule,
    });
    // Slot label pill top-left of the row (spans across but visually inside first cell tab)
    page1.drawRectangle({
      x: gridX + 4, y: rowTop - 14, width: slotLabelW, height: 12, color: C.accent,
    });
    const sTxt = slot.toUpperCase();
    page1.drawText(sTxt, {
      x: gridX + 4 + 6, y: rowTop - 14 + 3, size: 7.5, font: bold, color: rgb(1, 1, 1),
    });

    // Column separators + per-cell content
    DAY_NAMES.forEach((_, i) => {
      const cx = gridX + i * dayColW;
      if (i > 0) {
        page1.drawLine({
          start: { x: cx, y: rowBottom }, end: { x: cx, y: rowTop },
          thickness: 0.4, color: C.rule,
        });
      }
      // Cell contents
      const cellMeals = p.meals.filter((m) => m.day_of_week === i && m.meal_slot === slot);
      // Text area starts under the slot pill on day 0; other days start at top
      const textTop = (i === 0 ? rowTop - 30 : rowTop - 12);
      const textLeft = cx + 6;
      const textMaxW = dayColW - 12;
      let ty = textTop;
      if (cellMeals.length === 0) {
        page1.drawText("—", { x: textLeft, y: ty, size: 9, font, color: C.faint });
      } else {
        for (const m of cellMeals) {
          const label = m.label?.trim() || "(unnamed)";
          const nut = (m.nutrition_value != null && !Number.isNaN(m.nutrition_value))
            ? `  ${m.nutrition_value}${p.nutritionUnit}`
            : "";
          const lines = wrapHard(bold, label, 8.5, textMaxW - bold.widthOfTextAtSize(nut, 7.5));
          lines.forEach((ln, k) => {
            if (ty - 9 < rowBottom + 4) return;
            page1.drawText(ln, { x: textLeft, y: ty, size: 8.5, font: bold, color: C.text });
            if (k === 0 && nut) {
              page1.drawText(nut, {
                x: textLeft + bold.widthOfTextAtSize(ln, 8.5), y: ty,
                size: 7.5, font, color: C.muted,
              });
            }
            ty -= 10;
          });
          if (m.description) {
            const dLines = wrapHard(font, m.description, 7.5, textMaxW);
            for (const dl of dLines) {
              if (ty - 8 < rowBottom + 4) break;
              page1.drawText(dl, { x: textLeft, y: ty, size: 7.5, font: italic, color: C.muted });
              ty -= 9;
            }
          }
          ty -= 2;
          if (ty < rowBottom + 6) break;
        }
      }
    });
  });

  // Day totals footer row
  {
    const rowTop = bodyTop - SLOT_ORDER.length * bodyRowH;
    const rowBottom = rowTop - bodyRowH;
    page1.drawRectangle({
      x: gridX, y: rowBottom, width: CONTENT_W, height: bodyRowH, color: C.band,
    });
    page1.drawLine({
      start: { x: gridX, y: rowBottom }, end: { x: gridX + CONTENT_W, y: rowBottom },
      thickness: 0.5, color: C.rule,
    });
    // Label sits ABOVE the totals row so it never collides with the day-0 total.
    page1.drawText(`Daily ${p.nutritionLabel} (${p.nutritionUnit})`, {
      x: gridX, y: rowTop + 4, size: 8, font: bold, color: C.muted,
    });
    DAY_NAMES.forEach((_, i) => {
      const cx = gridX + i * dayColW;
      if (i > 0) {
        page1.drawLine({
          start: { x: cx, y: rowBottom }, end: { x: cx, y: rowTop },
          thickness: 0.4, color: C.rule,
        });
      }
      const total = p.meals
        .filter((m) => m.day_of_week === i)
        .reduce((s, m) => s + (m.nutrition_value ?? 0), 0);
      const txt = total > 0 ? `${total.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${p.nutritionUnit}` : "—";
      const size = 10;
      const w = bold.widthOfTextAtSize(txt, size);
      page1.drawText(txt, {
        x: cx + (dayColW - w) / 2, y: rowTop - 15, size, font: bold, color: C.ink,
      });
    });
  }

  // Outer grid border
  page1.drawRectangle({
    x: gridX, y: bodyBottom, width: CONTENT_W, height: gridTop - bodyBottom,
    borderColor: C.ink, borderWidth: 0.8, color: undefined,
  });

  // ── Page 2: preferences, allergies, shopping list ────────────────────────
  const page2 = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(page2);
  const p2Bottom = drawHeader({
    page: page2, bold, font, logoImg,
    orgName: p.orgName, title: "WEEKLY MENU — DETAILS",
    clientName: p.clientName, subtitle: `Week: ${p.weekLabel}`,
    generatedAt, pageW: PAGE_W, marginX: MARGIN_X, marginTop: MARGIN_TOP,
  });

  let py = p2Bottom - 22;
  // Two-column preferences block
  const colGap = 18;
  const colW = (CONTENT_W - colGap) / 2;

  const drawBlock = (
    page: PDFPage, x: number, yTop: number, w: number, title: string, body: string, tone: "default" | "warn" = "default",
  ): number => {
    const size = 9.5;
    const lines = wrapHard(font, body || "—", size, w - 16);
    const bodyH = Math.max(lines.length * 12, 20);
    const boxH = 22 + bodyH + 10;
    page.drawRectangle({
      x, y: yTop - boxH, width: w, height: boxH,
      borderColor: tone === "warn" ? C.warn : C.rule, borderWidth: 0.7,
      color: tone === "warn" ? C.soft : rgb(1, 1, 1),
    });
    page.drawRectangle({
      x, y: yTop - 22, width: w, height: 22, color: tone === "warn" ? C.warn : C.ink,
    });
    page.drawText(title.toUpperCase(), {
      x: x + 10, y: yTop - 15, size: 9, font: bold, color: rgb(1, 1, 1),
    });
    let ly = yTop - 22 - 14;
    for (const ln of lines) {
      page.drawText(ln, { x: x + 10, y: ly, size, font, color: C.text });
      ly -= 12;
    }
    return yTop - boxH;
  };

  const likesText = (p.foodLikes ?? "").trim() || "—";
  const dietBits: string[] = [];
  if (p.dietaryNeeds && p.dietaryNeeds.trim()) dietBits.push(`Dietary needs: ${p.dietaryNeeds.trim()}`);
  if (p.allergies && p.allergies.length) dietBits.push(`Allergies: ${p.allergies.join(", ")}`);
  const avoidText = [
    ...dietBits,
    ((p.foodsToAvoid ?? "").trim() || ""),
  ].filter(Boolean).join("\n");
  const avoidCombined = avoidText || "—";

  const leftBottom = drawBlock(page2, MARGIN_X, py, colW, "Foods Enjoyed", likesText);
  const rightBottom = drawBlock(
    page2, MARGIN_X + colW + colGap, py, colW,
    "Foods to Avoid & Allergies", avoidCombined,
    (p.allergies && p.allergies.length) || (p.foodsToAvoid && p.foodsToAvoid.trim()) ? "warn" : "default",
  );
  py = Math.min(leftBottom, rightBottom) - 20;

  // Shopping list block — two-column layout
  page2.drawRectangle({
    x: MARGIN_X, y: py - 22, width: CONTENT_W, height: 22, color: C.ink,
  });
  page2.drawText("SHOPPING LIST", {
    x: MARGIN_X + 10, y: py - 15, size: 9, font: bold, color: rgb(1, 1, 1),
  });
  const countTxt = `${p.shopping.length} item${p.shopping.length === 1 ? "" : "s"}`;
  const cw = font.widthOfTextAtSize(countTxt, 9);
  page2.drawText(countTxt, {
    x: MARGIN_X + CONTENT_W - 10 - cw, y: py - 15, size: 9, font, color: rgb(1, 1, 1),
  });
  py -= 22;

  if (p.shopping.length === 0) {
    page2.drawText("— no items —", { x: MARGIN_X + 10, y: py - 16, size: 10, font: italic, color: C.faint });
    py -= 24;
  } else {
    const shopColW = (CONTENT_W - 12) / 2;
    const rowH2 = 14;
    const items = p.shopping;
    const perCol = Math.ceil(items.length / 2);
    for (let idx = 0; idx < items.length; idx++) {
      const col = idx < perCol ? 0 : 1;
      const rowIdx = idx - col * perCol;
      const x = MARGIN_X + col * (shopColW + 12);
      const rowY = py - 4 - rowIdx * rowH2;
      if (rowY < MARGIN_BOTTOM + 12) break;
      // Checkbox
      page2.drawRectangle({
        x: x + 4, y: rowY - 9, width: 9, height: 9,
        borderColor: C.rule, borderWidth: 0.6,
        color: items[idx].checked ? C.accent : rgb(1, 1, 1),
      });
      const qty = items[idx].quantity ? ` — ${items[idx].quantity}` : "";
      const raw = `${items[idx].item}${qty}`;
      const line = wrapHard(font, raw, 9.5, shopColW - 24)[0] ?? raw;
      page2.drawText(line, {
        x: x + 18, y: rowY - 8, size: 9.5, font,
        color: items[idx].checked ? C.faint : C.text,
      });
    }
    py -= perCol * rowH2 + 8;
  }

  drawFooter({
    pages, font, bold, generatedAt,
    footerText: `Weekly menu prepared by ${p.orgName || "the provider"}. Point-in-time snapshot.`,
    pageW: PAGE_W, marginX: MARGIN_X, marginBottom: MARGIN_BOTTOM,
  });
  return await doc.save();
}

// ═══════════════════════════════════════════════════════════════════════════
// Plan vs. Actual report (portrait 612 × 792)
// ═══════════════════════════════════════════════════════════════════════════
export async function renderPlanVsActualPdf(p: PlanVsActualPdfPayload): Promise<Uint8Array> {
  const PAGE_W = 612, PAGE_H = 792;
  const MARGIN_X = 48, MARGIN_TOP = 44, MARGIN_BOTTOM = 54;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;

  const doc = await PDFDocument.create();
  doc.setTitle(`Meal Plan — Plan vs. Actual — ${p.clientName} — ${p.weekLabel}`);
  doc.setAuthor(p.orgName || "HIVE");
  doc.setCreator("HIVE");
  doc.setProducer("HIVE");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const logoImg = await embedLogo(doc, p.logo);
  const generatedAt = new Date();
  const pages: PDFPage[] = [];

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);
  let y = drawHeader({
    page, bold, font, logoImg,
    orgName: p.orgName, title: "MEAL PLAN — PLAN VS. ACTUAL",
    clientName: p.clientName, subtitle: `Week: ${p.weekLabel}`,
    generatedAt, pageW: PAGE_W, marginX: MARGIN_X, marginTop: MARGIN_TOP,
  }) - 20;

  // Column layout
  const cols = {
    day: 72,
    slot: 54,
    planned: 120,
    outcome: 80,
    note: 88,
    who: CONTENT_W - (72 + 54 + 120 + 80 + 88),
  };
  const xs = {
    day: MARGIN_X,
    slot: MARGIN_X + cols.day,
    planned: MARGIN_X + cols.day + cols.slot,
    outcome: MARGIN_X + cols.day + cols.slot + cols.planned,
    note: MARGIN_X + cols.day + cols.slot + cols.planned + cols.outcome,
    who: MARGIN_X + cols.day + cols.slot + cols.planned + cols.outcome + cols.note,
  };

  const HEADER_H = 18;
  const drawColHeaders = () => {
    page.drawRectangle({
      x: MARGIN_X, y: y - HEADER_H, width: CONTENT_W, height: HEADER_H, color: C.band,
    });
    page.drawLine({
      start: { x: MARGIN_X, y }, end: { x: PAGE_W - MARGIN_X, y },
      thickness: 0.5, color: C.rule,
    });
    page.drawLine({
      start: { x: MARGIN_X, y: y - HEADER_H }, end: { x: PAGE_W - MARGIN_X, y: y - HEADER_H },
      thickness: 0.5, color: C.rule,
    });
    const ty = y - HEADER_H + 5;
    page.drawText("DAY", { x: xs.day + 6, y: ty, size: 8, font: bold, color: C.muted });
    page.drawText("SLOT", { x: xs.slot + 6, y: ty, size: 8, font: bold, color: C.muted });
    page.drawText("PLANNED", { x: xs.planned + 6, y: ty, size: 8, font: bold, color: C.muted });
    page.drawText("OUTCOME", { x: xs.outcome + 6, y: ty, size: 8, font: bold, color: C.muted });
    page.drawText("NOTE", { x: xs.note + 6, y: ty, size: 8, font: bold, color: C.muted });
    page.drawText("CONFIRMED BY", { x: xs.who + 6, y: ty, size: 8, font: bold, color: C.muted });
    y -= HEADER_H;
  };

  drawColHeaders();

  const ensure = (need: number) => {
    if (y - need < MARGIN_BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      pages.push(page);
      y = drawHeader({
        page, bold, font, logoImg,
        orgName: p.orgName, title: "MEAL PLAN — PLAN VS. ACTUAL",
        clientName: p.clientName, subtitle: `Week: ${p.weekLabel}`,
        generatedAt, pageW: PAGE_W, marginX: MARGIN_X, marginTop: MARGIN_TOP,
      }) - 20;
      drawColHeaders();
    }
  };

  // Sort by day, then slot order
  const slotIndex = (s: MealSlot) => SLOT_ORDER.indexOf(s);
  const sorted = [...p.rows].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return slotIndex(a.meal_slot) - slotIndex(b.meal_slot);
  });

  const LINE_H = 11;
  sorted.forEach((r, idx) => {
    const dayLabel = `${DAY_NAMES[r.day_of_week]?.slice(0, 3) ?? "—"} ${new Date(`${r.date_iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    const plannedLines = wrapHard(font, r.planned || "—", 9, cols.planned - 12);
    const outcomeLines = wrapHard(font, r.outcome || "—", 9, cols.outcome - 12);
    const noteLines = wrapHard(font, r.note || "", 8.5, cols.note - 12);
    const whoText = [
      r.confirmed_by_name || "—",
      r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString() : "",
    ].filter(Boolean).join(" · ");
    const whoLines = wrapHard(font, whoText || "—", 8.5, cols.who - 12);

    const rowLines = Math.max(1, plannedLines.length, outcomeLines.length, noteLines.length || 1, whoLines.length);
    const rowH = rowLines * LINE_H + 6;
    ensure(rowH + 2);

    if (idx % 2 === 1) {
      page.drawRectangle({
        x: MARGIN_X, y: y - rowH + 2, width: CONTENT_W, height: rowH, color: C.zebra,
      });
    }

    const textY = y - 10;
    page.drawText(dayLabel, { x: xs.day + 6, y: textY, size: 9, font, color: C.text });
    page.drawText(r.meal_slot, { x: xs.slot + 6, y: textY, size: 9, font, color: C.text });
    plannedLines.forEach((ln, i) => page.drawText(ln, { x: xs.planned + 6, y: textY - i * LINE_H, size: 9, font, color: C.text }));
    outcomeLines.forEach((ln, i) => page.drawText(ln, {
      x: xs.outcome + 6, y: textY - i * LINE_H, size: 9,
      font: r.outcome ? bold : font,
      color: r.outcome ? C.ink : C.faint,
    }));
    noteLines.forEach((ln, i) => page.drawText(ln, { x: xs.note + 6, y: textY - i * LINE_H, size: 8.5, font, color: C.muted }));
    whoLines.forEach((ln, i) => page.drawText(ln, { x: xs.who + 6, y: textY - i * LINE_H, size: 8.5, font, color: C.muted }));

    y -= rowH;
    page.drawLine({
      start: { x: MARGIN_X, y: y + 2 }, end: { x: PAGE_W - MARGIN_X, y: y + 2 },
      thickness: 0.25, color: C.ruleSoft,
    });
  });

  // Summary line at bottom
  ensure(30);
  y -= 8;
  const confirmedCount = sorted.filter((r) => !!r.outcome).length;
  const totalSlots = sorted.length;
  page.drawText(
    `Confirmed ${confirmedCount} of ${totalSlots} slot${totalSlots === 1 ? "" : "s"} for the week.`,
    { x: MARGIN_X, y, size: 9.5, font: italic, color: C.muted },
  );

  drawFooter({
    pages, font, bold, generatedAt,
    footerText: `Plan-vs-actual snapshot generated by ${p.orgName || "the provider"}. Read-only record of nutrition support.`,
    pageW: PAGE_W, marginX: MARGIN_X, marginBottom: MARGIN_BOTTOM,
  });
  return await doc.save();
}

// ── Filename helpers ────────────────────────────────────────────────────────
export function mealPlanPdfFilename(clientName: string, weekLabel: string): string {
  const safe = (s: string) => s.replace(/[^\w\d]+/g, "_").replace(/^_+|_+$/g, "");
  return `weekly_menu_${safe(clientName)}_${safe(weekLabel)}.pdf`;
}
export function planVsActualPdfFilename(clientName: string, weekLabel: string): string {
  const safe = (s: string) => s.replace(/[^\w\d]+/g, "_").replace(/^_+|_+$/g, "");
  return `plan_vs_actual_${safe(clientName)}_${safe(weekLabel)}.pdf`;
}

// Storage-path tag for shipped snapshots (ISO Monday date, e.g. 2026-07-06).
export function weekTag(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}
