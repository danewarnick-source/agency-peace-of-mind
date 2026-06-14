import jsPDF from "jspdf";
import { ALL_SECTIONS, statusLabel, type ChecklistAnswers } from "./host-home-cert-items";

export type CertificatePayload = {
  clientName: string;
  hostName?: string | null;
  cert_type: "initial" | "annual";
  inspection_date: string;
  inspector_name: string;
  host_home_address: string;
  inspector_not_host_confirmed: boolean;
  attestation_confirmed: boolean;
  attestation_text: string;
  checklist: ChecklistAnswers;
  pcsp_status: "meets" | "does_not_meet";
  pcsp_notes?: string | null;
  determination: "certified" | "certified_with_corrections" | "not_certified";
  signature_name: string;
  signature_title: string;
  signed_at: string;
  guardian_acknowledgement_name?: string | null;
  next_due_date: string;
  concerns: Array<{ finding: string; corrective_action: string; target_date?: string | null; resolution_notes?: string | null; resolved_at?: string | null }>;
};

const PAGE_MARGIN = 48;
const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function determinationLabel(d: CertificatePayload["determination"]): string {
  switch (d) {
    case "certified": return "CERTIFIED";
    case "certified_with_corrections": return "CERTIFIED — Corrective actions pending";
    case "not_certified": return "NOT CERTIFIED";
  }
}

export function renderCertificatePdf(p: CertificatePayload): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = PAGE_MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_HEIGHT - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  };

  const line = (text: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH);
    ensureSpace(wrapped.length * (size + 2) + (opts.gap ?? 0));
    doc.text(wrapped, PAGE_MARGIN, y);
    y += wrapped.length * (size + 2) + (opts.gap ?? 0);
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Host Home Certification", PAGE_MARGIN, y);
  y += 22;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Determination: ${determinationLabel(p.determination)}`, PAGE_MARGIN, y);
  y += 16;
  doc.setDrawColor(180);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 14;

  // Metadata block
  line(`Person certified for: ${p.clientName}`);
  if (p.hostName) line(`Host home provider: ${p.hostName}`);
  line(`Host home address: ${p.host_home_address}`);
  line(`Inspection type: ${p.cert_type === "initial" ? "Initial (pre-placement)" : "Annual renewal"}`);
  line(`Inspection date: ${p.inspection_date}`);
  line(`Inspector: ${p.inspector_name}`);
  line(`Inspector is NOT the host home staff: ${p.inspector_not_host_confirmed ? "Confirmed" : "Not confirmed"}`);
  line(`Next certification due: ${p.next_due_date}`, { gap: 8 });

  // Checklist sections
  for (const section of ALL_SECTIONS) {
    ensureSpace(28);
    line(section.title, { bold: true, size: 12, gap: 4 });
    for (const item of section.items) {
      const ans = p.checklist[item.code];
      const label = `• ${item.label}`;
      const result = ans ? statusLabel(ans.status) : "—";
      line(`${label}  [${result}]`);
      if (ans?.note) line(`    Note: ${ans.note}`);
    }
    y += 6;
  }

  // PCSP
  ensureSpace(40);
  line("Person-Centered Support Plan (PCSP)", { bold: true, size: 12, gap: 4 });
  line(`Home and host support the person's PCSP needs: ${p.pcsp_status === "meets" ? "Meets" : "Does Not Meet"}`);
  if (p.pcsp_notes) line(`Notes: ${p.pcsp_notes}`, { gap: 6 });

  // Concerns
  ensureSpace(40);
  line("Concerns & Corrective Actions", { bold: true, size: 12, gap: 4 });
  if (p.concerns.length === 0) {
    line("No concerns identified.", { gap: 6 });
  } else {
    p.concerns.forEach((c, i) => {
      line(`${i + 1}. Finding: ${c.finding}`, { bold: true });
      line(`   Corrective action: ${c.corrective_action}`);
      if (c.target_date) line(`   Target date: ${c.target_date}`);
      if (c.resolved_at) line(`   Resolved: ${c.resolved_at}${c.resolution_notes ? ` — ${c.resolution_notes}` : ""}`);
      y += 4;
    });
  }

  // Signature
  ensureSpace(80);
  doc.setDrawColor(180);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 14;
  line("Inspector E-Signature", { bold: true, size: 12, gap: 4 });
  line(`Signed by: ${p.signature_name} — ${p.signature_title}`);
  line(`Signed at: ${new Date(p.signed_at).toLocaleString()}`);
  if (p.guardian_acknowledgement_name) {
    line(`Person / guardian acknowledgement: ${p.guardian_acknowledgement_name}`);
  }

  return doc.output("blob");
}
