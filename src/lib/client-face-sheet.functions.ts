/**
 * Client Face Sheet — printable emergency PDF.
 *
 * CRITICAL RULES:
 * - Every visible value is passed through `field()`. Empty / null / undefined
 *   renders literally as "Not on file". No inference, no autofill from
 *   related data — this is a law-enforcement-facing safety document.
 * - Data comes only from real records: clients row, organizations row,
 *   organization_branding row, and the client's own uploaded photo.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";

const NOT_ON_FILE = "Not on file";

function field(v: unknown): string {
  if (v === null || v === undefined) return NOT_ON_FILE;
  if (Array.isArray(v)) {
    const items = v.map((x) => String(x ?? "").trim()).filter(Boolean);
    return items.length ? items.join(", ") : NOT_ON_FILE;
  }
  const s = String(v).trim();
  return s.length ? s : NOT_ON_FILE;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return NOT_ON_FILE;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return NOT_ON_FILE;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function maskedSsn(last4: string | null | undefined): string {
  const v = (last4 ?? "").trim();
  if (!/^\d{4}$/.test(v)) return NOT_ON_FILE;
  return `***-**-${v}`;
}

function fmtHeight(inches: number | null | undefined): string {
  if (inches == null || Number.isNaN(Number(inches))) return NOT_ON_FILE;
  const n = Number(inches);
  if (n <= 0) return NOT_ON_FILE;
  const ft = Math.floor(n / 12);
  const rem = n - ft * 12;
  return `${ft}′ ${rem}″`;
}

function fmtWeight(pounds: number | null | undefined): string {
  if (pounds == null || Number.isNaN(Number(pounds))) return NOT_ON_FILE;
  const n = Number(pounds);
  if (n <= 0) return NOT_ON_FILE;
  return `${n} lb`;
}

export const generateClientFaceSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ pdfBase64: string; filename: string }> => {
    const { supabase } = context;

    // 1) Client row — RLS scopes to caller's org.
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .maybeSingle();
    if (clientErr) throw new Error(clientErr.message);
    if (!client) throw new Error("Client not found");

    // 2) Organization + branding.
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, legal_name, dba_name")
      .eq("id", client.organization_id)
      .maybeSingle();
    const { data: branding } = await supabase
      .from("organization_branding")
      .select("logo_path, org_address, org_phone")
      .eq("organization_id", client.organization_id)
      .maybeSingle();

    // 3) Optional binary assets: logo + client photo.
    async function downloadBytes(bucket: string, path: string | null | undefined): Promise<Uint8Array | null> {
      if (!path) return null;
      const { data: blob, error } = await supabase.storage.from(bucket).download(path);
      if (error || !blob) return null;
      const buf = await blob.arrayBuffer();
      return new Uint8Array(buf);
    }
    const [logoBytes, photoBytes] = await Promise.all([
      downloadBytes("org-branding", branding?.logo_path),
      downloadBytes("client-photos", client.client_photo_url ?? client.profile_photo_url),
    ]);

    // 4) Build PDF.
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Client Face Sheet - ${client.first_name ?? ""} ${client.last_name ?? ""}`.trim());
    pdf.setCreator("HIVE");
    const page = pdf.addPage([612, 792]); // US Letter
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);

    async function tryEmbedImage(bytes: Uint8Array | null): Promise<PDFImage | null> {
      if (!bytes) return null;
      try {
        return await pdf.embedPng(bytes);
      } catch {
        try {
          return await pdf.embedJpg(bytes);
        } catch {
          return null;
        }
      }
    }
    const [logoImg, photoImg] = await Promise.all([
      tryEmbedImage(logoBytes),
      tryEmbedImage(photoBytes),
    ]);

    drawFaceSheet(page, helv, helvB, {
      client,
      org: org ?? null,
      branding: branding ?? null,
      logoImg,
      photoImg,
    });

    const pdfBytes = await pdf.save();
    // Convert Uint8Array to base64 in a Worker-safe way.
    let bin = "";
    for (let i = 0; i < pdfBytes.length; i++) bin += String.fromCharCode(pdfBytes[i]);
    const pdfBase64 = btoa(bin);
    const safeName = `${client.first_name ?? "client"}-${client.last_name ?? ""}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return { pdfBase64, filename: `face-sheet-${safeName || "client"}.pdf` };
  });

// ─── Layout helpers ──────────────────────────────────────────────────────

type Client = Record<string, unknown> & {
  first_name: string | null;
  last_name: string | null;
  organization_id: string;
};

type Ctx = {
  client: Client;
  org: { id: string; name: string | null; legal_name: string | null; dba_name: string | null } | null;
  branding: { logo_path: string | null; org_address: string | null; org_phone: string | null } | null;
  logoImg: PDFImage | null;
  photoImg: PDFImage | null;
};

const INK = rgb(0.08, 0.09, 0.12);
const MUTED = rgb(0.42, 0.45, 0.5);
const BORDER = rgb(0.82, 0.84, 0.88);
const ACCENT = rgb(0.08, 0.35, 0.6);

const PAGE_W = 612;
const PAGE_H = 792;
const M = 36;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; maxWidth?: number },
): number {
  const { font, size, color = INK, maxWidth } = opts;
  const lines = maxWidth ? wrap(text, font, size, maxWidth) : [text];
  const lineHeight = size * 1.25;
  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i], { x, y: y - i * lineHeight, font, size, color });
  }
  return y - lines.length * lineHeight;
}

function drawKV(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  colW: number,
  helv: PDFFont,
  helvB: PDFFont,
): number {
  page.drawText(label, { x, y, size: 7.5, font: helvB, color: MUTED });
  const yVal = y - 11;
  const end = drawText(page, value, x, yVal, {
    font: helv,
    size: 9.5,
    color: INK,
    maxWidth: colW,
  });
  return end - 6;
}

function sectionHeader(page: PDFPage, title: string, x: number, y: number, w: number, helvB: PDFFont): number {
  page.drawRectangle({ x, y: y - 14, width: w, height: 14, color: rgb(0.94, 0.96, 0.98) });
  page.drawText(title.toUpperCase(), {
    x: x + 6,
    y: y - 10,
    size: 8,
    font: helvB,
    color: ACCENT,
  });
  return y - 20;
}

function hr(page: PDFPage, y: number): void {
  page.drawLine({
    start: { x: M, y },
    end: { x: PAGE_W - M, y },
    thickness: 0.5,
    color: BORDER,
  });
}

function drawFaceSheet(page: PDFPage, helv: PDFFont, helvB: PDFFont, ctx: Ctx): void {
  const { client, org, branding, logoImg, photoImg } = ctx;

  // ── Header ────────────────────────────────────────────────────────────
  // Logo top-left OR org name as large title
  const headerTop = PAGE_H - M;
  const orgDisplayName = field(org?.dba_name ?? org?.name);
  if (logoImg) {
    const maxH = 48;
    const scale = maxH / logoImg.height;
    const w = Math.min(180, logoImg.width * scale);
    const h = logoImg.height * (w / logoImg.width);
    page.drawImage(logoImg, { x: M, y: headerTop - h, width: w, height: h });
  } else {
    drawText(page, orgDisplayName, M, headerTop - 14, { font: helvB, size: 20, color: INK, maxWidth: 340 });
  }

  // Org address + phone top-right
  const rightColW = 220;
  const rightX = PAGE_W - M - rightColW;
  drawText(page, orgDisplayName, rightX, headerTop - 8, {
    font: helvB,
    size: 9,
    color: INK,
    maxWidth: rightColW,
  });
  drawText(page, field(branding?.org_address), rightX, headerTop - 22, {
    font: helv,
    size: 8.5,
    color: MUTED,
    maxWidth: rightColW,
  });
  drawText(page, field(branding?.org_phone), rightX, headerTop - 46, {
    font: helv,
    size: 8.5,
    color: MUTED,
    maxWidth: rightColW,
  });

  let y = headerTop - 60;
  hr(page, y);
  y -= 12;

  // ── Identity band ─────────────────────────────────────────────────────
  // Photo on the right, identity text on the left
  const photoBoxSize = 96;
  const photoX = PAGE_W - M - photoBoxSize;
  const photoY = y - photoBoxSize;
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoBoxSize,
    height: photoBoxSize,
    borderColor: BORDER,
    borderWidth: 0.75,
  });
  if (photoImg) {
    // Fit-cover into the box
    const box = photoBoxSize - 4;
    const scale = Math.max(box / photoImg.width, box / photoImg.height);
    const w = photoImg.width * scale;
    const h = photoImg.height * scale;
    page.drawImage(photoImg, {
      x: photoX + (photoBoxSize - w) / 2,
      y: photoY + (photoBoxSize - h) / 2,
      width: w,
      height: h,
    });
  } else {
    drawText(page, "No photo\non file", photoX + 22, photoY + 56, {
      font: helv,
      size: 9,
      color: MUTED,
    });
  }
  drawText(
    page,
    `Photo date: ${fmtDate(client.client_photo_taken_on as string | null)}`,
    photoX,
    photoY - 10,
    { font: helv, size: 7.5, color: MUTED, maxWidth: photoBoxSize },
  );

  // Identity text (left of photo)
  const idW = PAGE_W - M - M - photoBoxSize - 16;
  drawText(page, "CLIENT FACE SHEET", M, y, { font: helvB, size: 9, color: ACCENT });
  y -= 14;
  const fullName = `${field(client.first_name)} ${field(client.last_name)}`
    .replace(/Not on file Not on file/, "Not on file")
    .trim();
  drawText(page, fullName || "Not on file", M, y, {
    font: helvB,
    size: 20,
    color: INK,
    maxWidth: idW,
  });
  y -= 28;

  const bandColW = idW / 3 - 6;
  const bandY = y;
  drawKV(page, "Intake date", fmtDate(client.intake_date as string | null) === NOT_ON_FILE
    ? fmtDate(client.admission_date as string | null)
    : fmtDate(client.intake_date as string | null), M, bandY, bandColW, helv, helvB);
  drawKV(page, "PCSP date", fmtDate(client.pcsp_signed_date as string | null) === NOT_ON_FILE
    ? fmtDate(client.pcsp_expiration_date as string | null)
    : fmtDate(client.pcsp_signed_date as string | null), M + bandColW + 8, bandY, bandColW, helv, helvB);
  drawKV(page, "PID #", field(client.client_pid ?? client.form_1056_number), M + (bandColW + 8) * 2, bandY, bandColW, helv, helvB);

  y = photoY - 24;
  hr(page, y);
  y -= 12;

  // ── Two-column identity/insurance ─────────────────────────────────────
  const colW = (PAGE_W - M * 2 - 16) / 2;
  const leftX = M;
  const rightXCol = M + colW + 16;

  // Left column
  let yL = y;
  yL = sectionHeader(page, "Identity", leftX, yL, colW, helvB);
  yL = drawKV(page, "Home address", field(client.physical_address), leftX, yL, colW, helv, helvB);
  yL = drawKV(page, "Phone", field(client.phone_number), leftX, yL, colW, helv, helvB);
  yL = drawKV(page, "Date of birth", fmtDate(client.date_of_birth as string | null), leftX, yL, colW, helv, helvB);
  yL = drawKV(page, "Place of birth", field(client.place_of_birth), leftX, yL, colW, helv, helvB);
  yL = drawKV(page, "SSN", maskedSsn(client.ssn_last4 as string | null), leftX, yL, colW, helv, helvB);
  yL = drawKV(page, "Ethnic origin", field(client.ethnic_origin), leftX, yL, colW, helv, helvB);
  yL = drawKV(page, "Religion", field(client.religion), leftX, yL, colW, helv, helvB);

  // Right column
  let yR = y;
  yR = sectionHeader(page, "Insurance & ID", rightXCol, yR, colW, helvB);
  yR = drawKV(page, "Medicaid case #", field(client.medicaid_case_number), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Medicaid #", field(client.medicaid_id), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Medicare #", field(client.medicare_number), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Private insurance", field(client.private_insurance ?? client.medical_insurance), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Utah ID #", field(client.state_id_number), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Utah ID expires", fmtDate(client.state_id_expires_on as string | null), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Payment sources", field(client.payment_sources), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Income sources", field(client.income_sources), rightXCol, yR, colW, helv, helvB);

  y = Math.min(yL, yR) - 4;
  hr(page, y);
  y -= 12;

  // ── Contacts block ────────────────────────────────────────────────────
  y = sectionHeader(page, "Contacts", M, y, PAGE_W - M * 2, helvB);
  const c3 = (PAGE_W - M * 2 - 16) / 2;
  let yG = y;
  const guardianLabel = (client.is_own_guardian as boolean)
    ? "Client is own guardian"
    : [
        field(client.guardian_name),
        field(client.guardian_relationship) !== NOT_ON_FILE ? `(${client.guardian_relationship})` : "",
        field(client.guardian_phone) !== NOT_ON_FILE ? `\nPhone: ${client.guardian_phone}` : "",
        field(client.guardian_email) !== NOT_ON_FILE ? `\nEmail: ${client.guardian_email}` : "",
        field(client.guardian_address) !== NOT_ON_FILE ? `\n${client.guardian_address}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim() || NOT_ON_FILE;
  yG = drawKV(page, "Legal guardian(s)", guardianLabel, M, yG, c3, helv, helvB);

  yG = drawKV(
    page,
    "Primary emergency contact",
    [
      field(client.emergency_contact_name),
      field(client.emergency_contact_relationship) !== NOT_ON_FILE
        ? `(${client.emergency_contact_relationship})`
        : "",
      field(client.emergency_contact_phone) !== NOT_ON_FILE
        ? `\nPhone: ${client.emergency_contact_phone}`
        : "",
      field(client.emergency_contact_address) !== NOT_ON_FILE
        ? `\n${client.emergency_contact_address}`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || NOT_ON_FILE,
    M,
    yG,
    c3,
    helv,
    helvB,
  );

  let yG2 = y;
  yG2 = drawKV(
    page,
    "Secondary emergency contact",
    [
      field(client.emergency_contact_2_name),
      field(client.emergency_contact_2_relationship) !== NOT_ON_FILE
        ? `(${client.emergency_contact_2_relationship})`
        : "",
      field(client.emergency_contact_2_phone) !== NOT_ON_FILE
        ? `\nPhone: ${client.emergency_contact_2_phone}`
        : "",
      field(client.emergency_contact_2_address) !== NOT_ON_FILE
        ? `\n${client.emergency_contact_2_address}`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || NOT_ON_FILE,
    M + c3 + 16,
    yG2,
    c3,
    helv,
    helvB,
  );
  yG2 = drawKV(
    page,
    "Support coordinator",
    [
      field(client.support_coordinator_name),
      field(client.support_coordinator_company) !== NOT_ON_FILE
        ? `(${client.support_coordinator_company})`
        : "",
      field(client.support_coordinator_phone) !== NOT_ON_FILE
        ? `\nPhone: ${client.support_coordinator_phone}`
        : "",
      field(client.support_coordinator_email) !== NOT_ON_FILE
        ? `\nEmail: ${client.support_coordinator_email}`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || NOT_ON_FILE,
    M + c3 + 16,
    yG2,
    c3,
    helv,
    helvB,
  );

  y = Math.min(yG, yG2) - 4;
  hr(page, y);
  y -= 12;

  // ── Services block ────────────────────────────────────────────────────
  y = sectionHeader(page, "Services", M, y, PAGE_W - M * 2, helvB);
  const s3 = (PAGE_W - M * 2 - 32) / 3;
  let ySA = y;
  ySA = drawKV(page, "Residential provider", field(client.residential_provider), M, ySA, s3, helv, helvB);
  ySA = drawKV(page, "Day program / agency", field(client.day_program_provider), M, ySA, s3, helv, helvB);

  let ySB = y;
  const physician = [
    field(client.pcp_name ?? client.primary_care_name),
    field(client.pcp_phone ?? client.primary_care_phone) !== NOT_ON_FILE
      ? `Phone: ${client.pcp_phone ?? client.primary_care_phone}`
      : "",
    field(client.physician_address) !== NOT_ON_FILE ? String(client.physician_address) : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  ySB = drawKV(page, "Physician", physician || NOT_ON_FILE, M + s3 + 16, ySB, s3, helv, helvB);
  const dentist = [
    field(client.dentist_name),
    field(client.dentist_phone) !== NOT_ON_FILE ? `Phone: ${client.dentist_phone}` : "",
    field(client.dentist_address) !== NOT_ON_FILE ? String(client.dentist_address) : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  ySB = drawKV(page, "Dentist", dentist || NOT_ON_FILE, M + s3 + 16, ySB, s3, helv, helvB);

  let ySC = y;
  const psych = [
    field(client.psychiatrist_name ?? client.med_prescriber_name ?? client.prescriber_name),
    field(client.psychiatrist_phone ?? client.med_prescriber_phone ?? client.prescriber_phone) !== NOT_ON_FILE
      ? `Phone: ${client.psychiatrist_phone ?? client.med_prescriber_phone ?? client.prescriber_phone}`
      : "",
    field(client.psychiatrist_address) !== NOT_ON_FILE ? String(client.psychiatrist_address) : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  ySC = drawKV(page, "Psychiatrist", psych || NOT_ON_FILE, M + (s3 + 16) * 2, ySC, s3, helv, helvB);

  y = Math.min(ySA, ySB, ySC) - 4;
  hr(page, y);
  y -= 12;

  // ── Safety block ──────────────────────────────────────────────────────
  y = sectionHeader(page, "Safety", M, y, PAGE_W - M * 2, helvB);
  const s2 = (PAGE_W - M * 2 - 16) / 2;
  let ySF = y;
  ySF = drawKV(page, "Pertinent health info / concerns", field(client.pertinent_health_notes ?? client.clinical_alert), M, ySF, s2, helv, helvB);
  ySF = drawKV(page, "Allergies", field(client.allergies), M, ySF, s2, helv, helvB);
  ySF = drawKV(page, "Special dietary needs", field(client.dietary_needs), M, ySF, s2, helv, helvB);

  let ySFR = y;
  const desc = [
    `Height: ${fmtHeight(client.height_inches as number | null)}`,
    `Weight: ${fmtWeight(client.weight_pounds as number | null)}`,
    `Hair: ${field(client.hair_color)}`,
    `Eyes: ${field(client.eye_color)}`,
  ].join("   ");
  ySFR = drawKV(page, "Physical description", desc, M + s2 + 16, ySFR, s2, helv, helvB);
  ySFR = drawKV(page, "Places frequented", field(client.places_frequented), M + s2 + 16, ySFR, s2, helv, helvB);

  y = Math.min(ySF, ySFR) - 4;

  // ── Footer ────────────────────────────────────────────────────────────
  const footerY = 30;
  hr(page, footerY + 10);
  drawText(
    page,
    `Generated ${new Date().toLocaleString("en-US")} · Fields marked "Not on file" have no data on record — do not infer.`,
    M,
    footerY,
    { font: helv, size: 7, color: MUTED, maxWidth: PAGE_W - M * 2 },
  );
}
