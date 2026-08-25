import jsPDF from "jspdf";

export type SummaryPdfPayload = {
  clientName: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  services: string[];
  content: string;
  finalizedByName: string;
  finalizedAt: string;
  /** Provider display name (org / legal). Never invented. */
  providerName: string;
  providerAddress?: string | null;
  providerPhone?: string | null;
  supportCoordinatorName?: string | null;
  supportCoordinatorEmail?: string | null;
  staffNames?: string[];
  /** Data-URL or raw base64 image; omit when no uploaded logo. */
  logoDataUrl?: string | null;
  aiReviewAttested?: boolean;
  filingNote?: string | null;
};

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const NAVY: [number, number, number] = [13, 17, 43];
const MUTED: [number, number, number] = [92, 100, 120];

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function renderSummaryPdf(p: SummaryPdfPayload): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = PAGE_MARGIN;

  const ensure = (need: number) => {
    if (y + need > PAGE_HEIGHT - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  const writeLine = (
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      gap?: number;
      color?: [number, number, number];
      maxWidth?: number;
    } = {},
  ) => {
    const size = opts.size ?? 10;
    const color = opts.color ?? NAVY;
    doc.setTextColor(...color);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, opts.maxWidth ?? CONTENT_WIDTH) as string[];
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, PAGE_MARGIN, y);
      y += size + 4;
    }
    if (opts.gap) y += opts.gap;
  };

  // ── Letterhead ──────────────────────────────────────────────────────────
  const provider = (p.providerName || "Provider").trim();
  let logoDrawn = false;
  if (p.logoDataUrl) {
    try {
      const fmt = p.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(p.logoDataUrl, fmt, PAGE_MARGIN, y - 4, 48, 48);
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }

  const brandX = logoDrawn ? PAGE_MARGIN + 58 : PAGE_MARGIN;
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(provider, brandX, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Utah DSPD · Confidential · PHI", brandX, y + 26);
  if (p.providerAddress || p.providerPhone) {
    doc.text(
      [p.providerAddress, p.providerPhone].filter(Boolean).join(" · "),
      brandX,
      y + 38,
      { maxWidth: CONTENT_WIDTH - (logoDrawn ? 58 : 0) - 120 },
    );
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("Periodic Progress Summary", PAGE_WIDTH - PAGE_MARGIN, y + 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Prepared in HIVE", PAGE_WIDTH - PAGE_MARGIN, y + 26, { align: "right" });
  if (p.aiReviewAttested) {
    doc.text("Draft assist: Nectar", PAGE_WIDTH - PAGE_MARGIN, y + 38, { align: "right" });
  }

  y += 56;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.5);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 16;

  // ── Meta grid ───────────────────────────────────────────────────────────
  const meta: Array<[string, string]> = [
    ["Person", p.clientName],
    ["Period", `${p.periodLabel} · ${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}`],
    ["Service / billing codes", p.services.join(" · ") || "(none)"],
    ["Provider", provider],
    [
      "Support Coordinator",
      [p.supportCoordinatorName, p.supportCoordinatorEmail].filter(Boolean).join(" · ") || "Not on file",
    ],
    [
      "Staff who delivered support",
      (p.staffNames ?? []).filter(Boolean).join(", ") || "See source documentation",
    ],
  ];

  const colW = CONTENT_WIDTH / 2;
  for (let i = 0; i < meta.length; i += 2) {
    ensure(28);
    const left = meta[i];
    const right = meta[i + 1];
    const drawCell = (cell: [string, string], x: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(cell[0].toUpperCase(), x, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      const lines = doc.splitTextToSize(cell[1], colW - 8) as string[];
      doc.text(lines[0] ?? "", x, y + 12);
      return lines.length;
    };
    const lh = drawCell(left, PAGE_MARGIN);
    const rh = right ? drawCell(right, PAGE_MARGIN + colW) : 1;
    y += 12 + Math.max(lh, rh) * 11 + 6;
  }

  y += 4;
  doc.setDrawColor(228, 231, 239);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 14;

  // ── Body ────────────────────────────────────────────────────────────────
  const paragraphs = p.content.split(/\n+/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      y += 6;
      continue;
    }
    const isHeading =
      /^[A-Z0-9 ()/.,:-]{3,80}$/.test(trimmed) && trimmed === trimmed.toUpperCase();
    const isSubHeading = /^Goal:/i.test(trimmed);
    if (isHeading) {
      y += 6;
      writeLine(trimmed, { size: 10, bold: true, gap: 2, color: NAVY });
    } else if (isSubHeading) {
      writeLine(trimmed, { size: 10, bold: true, color: NAVY });
    } else {
      writeLine(trimmed, { size: 10, gap: 4, color: [42, 47, 66] });
    }
  }

  // ── Attestation footer ──────────────────────────────────────────────────
  y += 14;
  ensure(110);
  doc.setDrawColor(228, 231, 239);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 12;

  doc.setFillColor(250, 251, 254);
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 72, 4, 4, "F");
  doc.setDrawColor(228, 231, 239);
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 72, 4, 4, "S");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  const attest =
    "I reviewed this summary against HIVE documentation for this person and period. " +
    "Nectar drafted the narrative from staff/admin records in HIVE only; I confirm " +
    "the content is accurate and complete to the best of my knowledge.";
  const attestLines = doc.splitTextToSize(
    (p.aiReviewAttested ? "☑ " : "☐ ") + attest,
    CONTENT_WIDTH - 16,
  ) as string[];
  let ay = y + 14;
  for (const line of attestLines.slice(0, 4)) {
    doc.text(line, PAGE_MARGIN + 8, ay);
    ay += 11;
  }

  y += 84;
  ensure(40);
  writeLine(`Prepared by: ${p.finalizedByName}`, { size: 10, bold: true });
  writeLine(`Finalized: ${new Date(p.finalizedAt).toLocaleString()}`, {
    size: 9,
    color: MUTED,
  });
  if (p.filingNote) {
    writeLine(p.filingNote, { size: 8, color: MUTED, gap: 2 });
  }

  return doc.output("blob");
}
