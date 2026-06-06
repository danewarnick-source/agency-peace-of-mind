/**
 * Client Loan PDF generator — uses jsPDF to produce a clean legal-document
 * layout matching the provided Loan Agreement example. Runs in-browser and
 * triggers a download.
 */
import { jsPDF } from "jspdf";

export type LoanPdfData = {
  borrower_name: string;
  lender_name: string;
  agreement_date: string;
  purpose?: string | null;
  advance_amount?: number | null;
  advance_cadence?: string | null;
  direct_payment_amount?: number | null;
  direct_payment_cadence?: string | null;
  direct_payment_due_day?: string | null;
  direct_payment_start_date?: string | null;
  direct_payment_description?: string | null;
  interest_rate: number;
  interest_notes?: string | null;
  repayment_conditions: { id: string; label: string }[];
  maturity_date?: string | null;
  repayment_method?: string | null;
  voluntary_ack: boolean;
  signature_parties: { id: string; role: string; name: string; title?: string | null }[];
  notes?: string | null;
  running_balance?: number;
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "$0.00";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "____________________";
  try { return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); } catch { return s; }
}

export function generateLoanPdf(d: LoanPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 56;
  const maxW = pageW - M * 2;
  let y = M;

  const ensureSpace = (h: number) => {
    if (y + h > pageH - M) {
      doc.addPage();
      y = M;
    }
  };

  const writeP = (text: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
    const size = opts.size ?? 11;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxW);
    ensureSpace(lines.length * (size + 3) + (opts.gap ?? 6));
    doc.text(lines, M, y);
    y += lines.length * (size + 3) + (opts.gap ?? 6);
  };

  const heading = (n: number, title: string) => {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`${n}. ${title}`, M, y);
    y += 18;
  };

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("LOAN AGREEMENT (on file — copy for records)", pageW / 2, y, { align: "center" });
  y += 26;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("DRAFT — pending legal review", pageW / 2, y, { align: "center" });
  y += 20;

  writeP(
    `This document is a copy of the Loan Agreement kept on file. It was entered into on ${fmtDate(d.agreement_date)} between ${d.lender_name} ("Lender") and ${d.borrower_name} ("Borrower"), reflecting an arrangement the company and the client's support team independently decided to enter into.`,
  );

  heading(1, "Purpose");
  writeP(d.purpose?.trim() || "The Lender agrees to provide financial support to the Borrower under the terms set forth in this Agreement.");

  heading(2, "Advance Terms");
  if (d.advance_amount && Number(d.advance_amount) > 0) {
    writeP(
      `The Lender shall advance ${fmtMoney(d.advance_amount)} to the Borrower on a ${d.advance_cadence ?? "recurring"} basis. The cumulative amount advanced shall constitute the running principal balance owed under this Agreement.`,
    );
  } else {
    writeP("No recurring cash advance has been agreed to under this Agreement.");
  }
  if (d.direct_payment_amount && Number(d.direct_payment_amount) > 0) {
    writeP(
      `The Lender shall, on the Borrower's behalf, make a recurring direct payment of ${fmtMoney(d.direct_payment_amount)} ${d.direct_payment_cadence ? `(${d.direct_payment_cadence})` : ""}${d.direct_payment_due_day ? `, due ${d.direct_payment_due_day}` : ""}${d.direct_payment_start_date ? `, beginning ${fmtDate(d.direct_payment_start_date)}` : ""}${d.direct_payment_description ? ` for: ${d.direct_payment_description}` : ""}. Each such payment shall be added to the running principal balance owed by the Borrower.`,
    );
  }

  heading(3, "Interest");
  if (!d.interest_rate || d.interest_rate === 0) {
    writeP("This loan is interest-free. No interest shall accrue on amounts advanced or paid on behalf of the Borrower.");
  } else {
    writeP(`Interest shall accrue at a rate of ${d.interest_rate}% per annum on the outstanding principal balance.${d.interest_notes ? " " + d.interest_notes : ""}`);
  }

  heading(4, "Repayment");
  if (d.repayment_conditions.length === 0 && !d.maturity_date) {
    writeP("Repayment terms shall be agreed upon in writing by the parties.");
  } else {
    if (d.repayment_conditions.length) {
      writeP("The Borrower agrees to repay the outstanding balance upon the earliest of the following:");
      d.repayment_conditions.forEach((c, i) => writeP(`   (${String.fromCharCode(97 + i)}) ${c.label}`, { gap: 3 }));
    }
    if (d.maturity_date) writeP(`In any event, the entire outstanding balance shall be due on or before ${fmtDate(d.maturity_date)} (the "Maturity Date").`);
  }
  if (d.repayment_method) writeP(`Method of repayment: ${d.repayment_method}`);

  heading(5, "Voluntary Participation");
  if (d.voluntary_ack) {
    writeP("The Borrower acknowledges that participation in this Agreement is entirely voluntary. The Borrower's decision to accept or decline this loan shall not affect, in any way, the services the Borrower receives from the Lender or any of its affiliates.");
  }

  heading(6, "Entire Agreement");
  writeP("This Agreement constitutes the entire understanding between the parties with respect to the subject matter herein and supersedes all prior agreements, representations, and understandings, whether written or oral.");

  if (typeof d.running_balance === "number") {
    heading(7, "Current Running Balance");
    writeP(`As of ${fmtDate(new Date().toISOString())}, the running principal balance owed by the Borrower under this Agreement is ${fmtMoney(d.running_balance)}.`);
  }

  heading(typeof d.running_balance === "number" ? 8 : 7, "Signatures");
  const parties = d.signature_parties.length
    ? d.signature_parties
    : [
        { id: "b", role: "Borrower", name: d.borrower_name, title: "" },
        { id: "l", role: "Lender", name: d.lender_name, title: "" },
      ];
  for (const p of parties) {
    ensureSpace(70);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(p.role, M, y); y += 14;
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${p.name || "_______________________________"}`, M, y); y += 14;
    if (p.title) { doc.text(`Title: ${p.title}`, M, y); y += 14; }
    doc.line(M, y + 16, M + 260, y + 16);
    doc.line(M + 300, y + 16, M + 300 + 180, y + 16);
    doc.setFontSize(8);
    doc.text("Signature", M, y + 28);
    doc.text("Date", M + 300, y + 28);
    doc.setFontSize(10);
    y += 44;
  }

  if (d.notes) {
    heading(99, "Additional Notes");
    writeP(d.notes);
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text(`Page ${i} of ${pageCount} — DRAFT, pending legal review`, pageW / 2, pageH - 24, { align: "center" });
  }

  return doc;
}

export function downloadLoanPdf(d: LoanPdfData, filename = "loan-agreement.pdf") {
  const doc = generateLoanPdf(d);
  doc.save(filename);
}
