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
};

const PAGE_MARGIN = 54;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

export function renderSummaryPdf(p: SummaryPdfPayload): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = PAGE_MARGIN;

  const ensure = (need: number) => {
    if (y + need > PAGE_HEIGHT - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  const writeLine = (text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, PAGE_MARGIN, y);
      y += size + 4;
    }
    if (opts.gap) y += opts.gap;
  };

  // Header.
  writeLine("Periodic Progress Summary", { size: 16, bold: true, gap: 2 });
  writeLine(`Person: ${p.clientName}`, { size: 11, bold: true });
  writeLine(`Period: ${p.periodLabel}  (${p.periodStart} to ${p.periodEnd})`, { size: 10 });
  writeLine(`Services: ${p.services.join(", ") || "(none)"}`, { size: 10, gap: 8 });

  // Divider.
  doc.setDrawColor(180);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 12;

  // Body — preserve paragraph breaks, render section headings (ALL CAPS line) in bold.
  const paragraphs = p.content.split(/\n+/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) { y += 6; continue; }
    // Treat a line of mostly upper-case as a heading.
    const isHeading = /^[A-Z0-9 ()/.,:-]{3,80}$/.test(trimmed) && trimmed === trimmed.toUpperCase();
    const isSubHeading = /^Goal:/i.test(trimmed);
    if (isHeading) {
      y += 4;
      writeLine(trimmed, { size: 11, bold: true, gap: 2 });
    } else if (isSubHeading) {
      writeLine(trimmed, { size: 10, bold: true });
    } else {
      writeLine(trimmed, { size: 10, gap: 4 });
    }
  }

  // Footer / attestation.
  y += 12;
  ensure(60);
  doc.setDrawColor(180);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 14;
  writeLine(`Prepared by: ${p.finalizedByName}`, { size: 10, bold: true });
  writeLine(`Finalized: ${new Date(p.finalizedAt).toLocaleString()}`, { size: 9 });

  return doc.output("blob");
}
