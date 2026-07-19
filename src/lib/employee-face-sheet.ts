/**
 * Employee Face Sheet — printable, professional PDF that aggregates the
 * full staffer record into one document.
 *
 * Parallel to `client-face-sheet.functions.ts` / the client Face Sheet, but
 * scoped to staff and stored in the employee HR bucket.
 *
 * Pulled together on demand from the same tables the profile UI reads:
 *   - profiles (identity, contact, position, hire date, emergency contact)
 *   - organization_members (HIVE role + active status)
 *   - staff_types + profiles.staff_type_keys (org title tier)
 *   - teams (team assignment)
 *   - certifications + external_certifications + baseline training
 *     completions (certs & trainings with expirations)
 *   - employee_documents (HR docs list)
 *
 * CRITICAL: no fabrication. Every empty value renders literally as "—".
 * When ship=true the same bytes are uploaded to the employee-docs bucket
 * and inserted into employee_documents (kind = 'face_sheet') — the manual
 * snapshot flow parallels the client's ship-to-file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type PDFImage } from "pdf-lib";

const EMPTY = "—";
const BUCKET = "employee-docs";

// ─── Types ─────────────────────────────────────────────────────────────────

export type EmployeeFaceSheetArgs = {
  staffId: string;
  organizationId: string;
  supabaseClient?: SupabaseClient;
};

export type EmployeeFaceSheetResult = {
  bytes: Uint8Array;
  filename: string;
  staffId: string;
  staffName: string;
  organizationId: string;
  orgName: string;
  /** ISO timestamp when the sheet was rendered. */
  generatedAt: string;
  periodLabel: string; // "As of <date>"
};

export type ShippedEmployeeFaceSheet = EmployeeFaceSheetResult & {
  storagePath: string;
  documentId: string;
};

// ─── Value helpers ─────────────────────────────────────────────────────────

function field(v: unknown): string {
  if (v === null || v === undefined) return EMPTY;
  if (Array.isArray(v)) {
    const items = v.map((x) => String(x ?? "").trim()).filter(Boolean);
    return items.length ? items.join(", ") : EMPTY;
  }
  const s = String(v).trim();
  return s.length ? s : EMPTY;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return EMPTY;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return EMPTY;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Data fetch ────────────────────────────────────────────────────────────

type CertRow = {
  label: string;
  source: string; // "HIVE cert" | "External cert" | "Baseline training"
  issued: string | null;
  expires: string | null;
};

type HrDocRow = {
  kind: string;
  title: string | null;
  file_name: string | null;
  uploaded_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  status: string | null;
};

async function loadEmployeeSheetData(sb: SupabaseClient, staffId: string, organizationId: string) {
  // 1) Member + profile — reveals org + all identity fields.
  //    The profile page passes the active org explicitly, which keeps multi-org
  //    users from tripping object-mode queries with multiple memberships.
  const { data: member, error: mErr } = await sb
    .from("organization_members")
    .select("id, role, active, organization_id")
    .eq("user_id", staffId)
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!member) throw new Error("Employee not found in your organization");
  const orgId = (member as { organization_id: string }).organization_id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: pErr } = await (sb as any)
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, email, username, phone, employee_id, position, positions, department, hire_date, account_status, worker_type, team_id, photo_path, staff_type_keys, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone",
    )
    .eq("id", staffId)
    .limit(1)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);

  // 2) Organization + branding for header.
  const { data: org } = await sb
    .from("organizations")
    .select("id, name, legal_name, dba_name")
    .eq("id", orgId)
    .limit(1)
    .maybeSingle();
  const { data: branding } = await sb
    .from("organization_branding")
    .select("logo_path, org_address, org_phone")
    .eq("organization_id", orgId)
    .limit(1)
    .maybeSingle();

  // 3) Team (if assigned).
  const teamId = (profile as { team_id: string | null } | null)?.team_id ?? null;
  let team: { team_name: string | null } | null = null;
  if (teamId) {
    const { data } = await sb.from("teams").select("team_name").eq("id", teamId).limit(1).maybeSingle();
    team = (data as { team_name: string | null } | null) ?? null;
  }

  // 4) Staff-type labels for org title tier.
  const { data: typesCatalog } = await sb
    .from("staff_types")
    .select("key, label")
    .eq("organization_id", orgId);
  const typeByKey = new Map(
    ((typesCatalog ?? []) as Array<{ key: string; label: string }>).map((t) => [t.key, t.label]),
  );
  const typeKeys =
    ((profile as { staff_type_keys: string[] | null } | null)?.staff_type_keys ?? []) as string[];
  const staffTypeLabels = typeKeys.map((k) => typeByKey.get(k) ?? k);

  // 5) Certifications from all three sources.
  const certs: CertRow[] = [];
  const { data: hiveCerts } = await sb
    .from("certifications")
    .select("course_title, issued_at, expires_at, certification_type_code")
    .eq("user_id", staffId);
  for (const r of (hiveCerts ?? []) as Array<{
    course_title: string | null;
    issued_at: string | null;
    expires_at: string | null;
    certification_type_code: string | null;
  }>) {
    certs.push({
      label: r.course_title ?? r.certification_type_code ?? "HIVE certification",
      source: "HIVE cert",
      issued: r.issued_at,
      expires: r.expires_at,
    });
  }
  const { data: extCerts } = await sb
    .from("external_certifications")
    .select("cert_name, cert_type, issuer, issued_date, expires_at, status")
    .eq("user_id", staffId);
  for (const r of (extCerts ?? []) as Array<{
    cert_name: string | null;
    cert_type: string | null;
    issuer: string | null;
    issued_date: string | null;
    expires_at: string | null;
    status: string | null;
  }>) {
    certs.push({
      label:
        [r.cert_name ?? r.cert_type ?? "External certification", r.issuer ? `— ${r.issuer}` : ""]
          .filter(Boolean)
          .join(" ")
          .trim(),
      source: `External cert${r.status ? ` · ${r.status}` : ""}`,
      issued: r.issued_date,
      expires: r.expires_at,
    });
  }
  const { data: baseline } = await sb
    .from("staff_baseline_training_completions")
    .select("training_key, completed_date, expires_at")
    .eq("staff_id", staffId)
    .eq("organization_id", orgId);
  for (const r of (baseline ?? []) as Array<{
    training_key: string | null;
    completed_date: string | null;
    expires_at: string | null;
  }>) {
    certs.push({
      label: (r.training_key ?? "Baseline training").replace(/_/g, " "),
      source: "Baseline training",
      issued: r.completed_date,
      expires: r.expires_at,
    });
  }
  // Sort: soonest expiration first, then non-expiring at the bottom.
  certs.sort((a, b) => {
    const ax = a.expires ? new Date(a.expires).getTime() : Number.POSITIVE_INFINITY;
    const bx = b.expires ? new Date(b.expires).getTime() : Number.POSITIVE_INFINITY;
    return ax - bx;
  });

  // Deadlines = certs expiring within 90 days (or already expired).
  const now = Date.now();
  const soon = now + 90 * 24 * 3600 * 1000;
  const deadlines = certs.filter((c) => {
    if (!c.expires) return false;
    const t = new Date(c.expires).getTime();
    return Number.isFinite(t) && t <= soon;
  });

  // 6) HR docs list.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: hrDocs } = await (sb as any)
    .from("employee_documents")
    .select("kind, title, file_name, uploaded_at, effective_from, effective_to, status")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .order("uploaded_at", { ascending: false });

  // 7) Photo bytes for the identity band.
  let photoBytes: Uint8Array | null = null;
  const photoPath = (profile as { photo_path: string | null } | null)?.photo_path ?? null;
  if (photoPath) {
    const { data: blob } = await sb.storage.from("staff-photos").download(photoPath);
    if (blob) photoBytes = new Uint8Array(await blob.arrayBuffer());
  }
  // Logo bytes.
  let logoBytes: Uint8Array | null = null;
  const logoPath = (branding as { logo_path: string | null } | null)?.logo_path ?? null;
  if (logoPath) {
    const { data: blob } = await sb.storage.from("org-branding").download(logoPath);
    if (blob) logoBytes = new Uint8Array(await blob.arrayBuffer());
  }

  return {
    orgId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile: (profile ?? {}) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    member: member as any,
    org: (org ?? null) as { name: string | null; legal_name: string | null; dba_name: string | null } | null,
    branding: (branding ?? null) as {
      logo_path: string | null;
      org_address: string | null;
      org_phone: string | null;
    } | null,
    team,
    staffTypeLabels,
    certs,
    deadlines,
    hrDocs: ((hrDocs ?? []) as HrDocRow[]),
    photoBytes,
    logoBytes,
  };
}

// ─── PDF drawing ───────────────────────────────────────────────────────────

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
  const end = drawText(page, value, x, yVal, { font: helv, size: 9.5, color: INK, maxWidth: colW });
  return end - 6;
}

function sectionHeader(page: PDFPage, title: string, x: number, y: number, w: number, helvB: PDFFont): number {
  page.drawRectangle({ x, y: y - 14, width: w, height: 14, color: rgb(0.94, 0.96, 0.98) });
  page.drawText(title.toUpperCase(), { x: x + 6, y: y - 10, size: 8, font: helvB, color: ACCENT });
  return y - 20;
}

function hr(page: PDFPage, y: number): void {
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: BORDER });
}

async function tryEmbedImage(pdf: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
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

// ─── Generator ─────────────────────────────────────────────────────────────

export async function generateEmployeeFaceSheet(
  args: EmployeeFaceSheetArgs,
): Promise<EmployeeFaceSheetResult> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const d = await loadEmployeeSheetData(sb, args.staffId, args.organizationId);
  const p = d.profile;
  const name =
    (p.full_name && String(p.full_name).trim()) ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    (p.username && String(p.username).trim()) ||
    (p.email && String(p.email).trim()) ||
    "Employee";
  const orgName = (d.org?.dba_name ?? d.org?.name ?? "").trim() || "Organization";

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Employee Face Sheet - ${name}`);
  pdf.setCreator("HIVE");
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [logoImg, photoImg] = await Promise.all([
    tryEmbedImage(pdf, d.logoBytes),
    tryEmbedImage(pdf, d.photoBytes),
  ]);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const generatedAt = new Date();
  const periodLabel = `As of ${generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`;

  // ── Header ────────────────────────────────────────────────────────────
  const headerTop = PAGE_H - M;
  if (logoImg) {
    const maxH = 48;
    const scale = maxH / logoImg.height;
    const w = Math.min(180, logoImg.width * scale);
    const h = logoImg.height * (w / logoImg.width);
    page.drawImage(logoImg, { x: M, y: headerTop - h, width: w, height: h });
  } else {
    drawText(page, orgName, M, headerTop - 14, { font: helvB, size: 20, color: INK, maxWidth: 340 });
  }
  const rightColW = 220;
  const rightX = PAGE_W - M - rightColW;
  drawText(page, orgName, rightX, headerTop - 8, {
    font: helvB, size: 9, color: INK, maxWidth: rightColW,
  });
  drawText(page, field(d.branding?.org_address), rightX, headerTop - 22, {
    font: helv, size: 8.5, color: MUTED, maxWidth: rightColW,
  });
  drawText(page, field(d.branding?.org_phone), rightX, headerTop - 46, {
    font: helv, size: 8.5, color: MUTED, maxWidth: rightColW,
  });

  let y = headerTop - 60;
  hr(page, y);
  y -= 12;

  // ── Identity band ─────────────────────────────────────────────────────
  const photoBoxSize = 96;
  const photoX = PAGE_W - M - photoBoxSize;
  const photoY = y - photoBoxSize;
  page.drawRectangle({
    x: photoX, y: photoY, width: photoBoxSize, height: photoBoxSize,
    borderColor: BORDER, borderWidth: 0.75,
  });
  if (photoImg) {
    const box = photoBoxSize - 4;
    const scale = Math.max(box / photoImg.width, box / photoImg.height);
    const w = photoImg.width * scale;
    const h = photoImg.height * scale;
    page.drawImage(photoImg, {
      x: photoX + (photoBoxSize - w) / 2,
      y: photoY + (photoBoxSize - h) / 2,
      width: w, height: h,
    });
  } else {
    drawText(page, "No photo\non file", photoX + 22, photoY + 56, { font: helv, size: 9, color: MUTED });
  }

  const idW = PAGE_W - M - M - photoBoxSize - 16;
  drawText(page, "EMPLOYEE FACE SHEET", M, y, { font: helvB, size: 9, color: ACCENT });
  y -= 14;
  drawText(page, name, M, y, { font: helvB, size: 20, color: INK, maxWidth: idW });
  y -= 24;
  // Org title tier (from staff types) + HIVE role/status
  const orgTitle = d.staffTypeLabels.length
    ? (d.staffTypeLabels.length <= 3
        ? d.staffTypeLabels.join(" / ")
        : `${d.staffTypeLabels[0]} and ${d.staffTypeLabels.length - 1} more`)
    : EMPTY;
  drawText(page, orgTitle, M, y, { font: helv, size: 10, color: INK, maxWidth: idW });
  y -= 14;
  const roleLine = `${String(d.member.role ?? "").toUpperCase()} · ${d.member.active ? "Active" : "Deactivated"}`;
  drawText(page, roleLine, M, y, { font: helvB, size: 8, color: ACCENT, maxWidth: idW });
  y -= 12;

  y = Math.min(y, photoY - 8);
  hr(page, y);
  y -= 12;

  // ── Two-column identity / employment ─────────────────────────────────
  const colW = (PAGE_W - M * 2 - 16) / 2;
  const rightXCol = M + colW + 16;

  let yL = y;
  yL = sectionHeader(page, "Identity & contact", M, yL, colW, helvB);
  yL = drawKV(page, "Email", field(p.email), M, yL, colW, helv, helvB);
  yL = drawKV(page, "Phone", field(p.phone), M, yL, colW, helv, helvB);
  yL = drawKV(page, "Employee ID", field(p.employee_id), M, yL, colW, helv, helvB);
  yL = drawKV(page, "Emergency contact",
    [
      field(p.emergency_contact_name),
      field(p.emergency_contact_relationship) !== EMPTY ? `(${p.emergency_contact_relationship})` : "",
      field(p.emergency_contact_phone) !== EMPTY ? `\nPhone: ${p.emergency_contact_phone}` : "",
    ].filter(Boolean).join(" ").trim() || EMPTY,
    M, yL, colW, helv, helvB);

  let yR = y;
  yR = sectionHeader(page, "Employment", rightXCol, yR, colW, helvB);
  const positions = Array.isArray(p.positions) && p.positions.length
    ? (p.positions as string[]).join(", ")
    : field(p.position);
  yR = drawKV(page, "Position / role", positions, rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Staff types",
    d.staffTypeLabels.length ? d.staffTypeLabels.join(", ") : EMPTY,
    rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Team", field(d.team?.team_name), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Department", field(p.department), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Worker type", field(p.worker_type), rightXCol, yR, colW, helv, helvB);
  yR = drawKV(page, "Hire date", fmtDate(p.hire_date as string | null), rightXCol, yR, colW, helv, helvB);

  y = Math.min(yL, yR) - 4;
  hr(page, y);
  y -= 12;

  // ── Table renderer with page-break support ────────────────────────────
  function ensureSpace(needed: number): void {
    if (y - needed < 60) {
      // footer margin
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  }

  function drawRow(cells: string[], widths: number[], bold = false): void {
    ensureSpace(16);
    let x = M;
    const rowH = 12;
    const font = bold ? helvB : helv;
    const size = bold ? 8.5 : 9;
    for (let i = 0; i < cells.length; i++) {
      const lines = wrap(cells[i], font, size, widths[i] - 6);
      const first = lines[0] ?? "";
      page.drawText(first, { x: x + 3, y: y - 9, font, size, color: bold ? MUTED : INK });
      x += widths[i];
    }
    y -= rowH;
    page.drawLine({
      start: { x: M, y }, end: { x: PAGE_W - M, y },
      thickness: 0.25, color: BORDER,
    });
  }

  // ── Certifications & trainings ────────────────────────────────────────
  ensureSpace(40);
  y = sectionHeader(page, "Certifications & trainings", M, y, PAGE_W - M * 2, helvB);
  const certW = [PAGE_W - M * 2 - 90 - 90 - 90, 90, 90, 90];
  drawRow(["Credential", "Source", "Issued", "Expires"], certW, true);
  if (d.certs.length === 0) {
    ensureSpace(14);
    drawText(page, EMPTY, M + 3, y - 10, { font: helv, size: 9, color: MUTED });
    y -= 14;
  } else {
    for (const c of d.certs) {
      drawRow([c.label, c.source, fmtDate(c.issued), fmtDate(c.expires)], certW);
    }
  }
  y -= 6;

  // ── Deadlines (next 90 days) ─────────────────────────────────────────
  ensureSpace(40);
  y = sectionHeader(page, "Deadlines · next 90 days", M, y, PAGE_W - M * 2, helvB);
  const dlW = [PAGE_W - M * 2 - 100 - 100, 100, 100];
  drawRow(["Item", "Source", "Expires"], dlW, true);
  if (d.deadlines.length === 0) {
    ensureSpace(14);
    drawText(page, "No credentials expiring in the next 90 days.", M + 3, y - 10, {
      font: helv, size: 9, color: MUTED,
    });
    y -= 14;
  } else {
    for (const dl of d.deadlines) {
      drawRow([dl.label, dl.source, fmtDate(dl.expires)], dlW);
    }
  }
  y -= 6;

  // ── HR documents ─────────────────────────────────────────────────────
  ensureSpace(40);
  y = sectionHeader(page, "HR documents on file", M, y, PAGE_W - M * 2, helvB);
  const docW = [PAGE_W - M * 2 - 90 - 90 - 90, 90, 90, 90];
  drawRow(["Document", "Kind", "Uploaded", "Status"], docW, true);
  if (d.hrDocs.length === 0) {
    ensureSpace(14);
    drawText(page, "No HR documents on file.", M + 3, y - 10, {
      font: helv, size: 9, color: MUTED,
    });
    y -= 14;
  } else {
    for (const doc of d.hrDocs) {
      drawRow(
        [
          doc.title ?? doc.file_name ?? "(untitled)",
          field(doc.kind),
          fmtDate(doc.uploaded_at),
          field(doc.status ?? "current"),
        ],
        docW,
      );
    }
  }

  // ── Footer on every page ─────────────────────────────────────────────
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    const footerY = 30;
    pg.drawLine({
      start: { x: M, y: footerY + 10 }, end: { x: PAGE_W - M, y: footerY + 10 },
      thickness: 0.5, color: BORDER,
    });
    drawText(
      pg,
      `Employee Face Sheet — ${name} · ${orgName} · Generated ${generatedAt.toLocaleString("en-US")} · Empty values render as "—" — no data is inferred. Page ${i + 1} of ${pages.length}`,
      M,
      footerY,
      { font: helv, size: 7, color: MUTED, maxWidth: PAGE_W - M * 2 },
    );
  }

  const bytes = await pdf.save();
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    bytes,
    filename: `employee-face-sheet-${safeName || "employee"}.pdf`,
    staffId: args.staffId,
    staffName: name,
    organizationId: d.orgId,
    orgName,
    generatedAt: generatedAt.toISOString(),
    periodLabel,
  };
}

// ─── Ship-to-file ──────────────────────────────────────────────────────────

export async function shipEmployeeFaceSheet(
  args: EmployeeFaceSheetArgs,
): Promise<ShippedEmployeeFaceSheet> {
  const sb = args.supabaseClient ?? defaultSupabase;
  const report = await generateEmployeeFaceSheet({ ...args, supabaseClient: sb });

  const uid = (await sb.auth.getUser()).data.user?.id ?? null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // First path segment MUST be org id to satisfy the storage RLS check.
  const storagePath = `${report.organizationId}/${report.staffId}/face-sheets/employee-face-sheet-${stamp}.pdf`;
  const blob = new Blob([new Uint8Array(report.bytes)], { type: "application/pdf" });

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, blob, { upsert: false, contentType: "application/pdf" });
  if (upErr) throw upErr;

  const displayName = `Employee Face Sheet — ${report.periodLabel}.pdf`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedRows, error: insErr } = await (sb as any)
    .from("employee_documents")
    .insert([{
      organization_id: report.organizationId,
      staff_id: report.staffId,
      kind: "face_sheet",
      title: displayName,
      file_path: storagePath,
      file_name: displayName,
      mime_type: "application/pdf",
      size_bytes: report.bytes.byteLength,
      uploaded_by: uid,
    }])
    .select("id")
    .limit(1);
  if (insErr) throw new Error(insErr.message);
  const inserted = Array.isArray(insertedRows) ? insertedRows[0] : null;
  if (!inserted) throw new Error("Face sheet saved, but the HR document record could not be confirmed.");

  return {
    ...report,
    storagePath,
    documentId: (inserted as { id: string }).id,
  };
}
