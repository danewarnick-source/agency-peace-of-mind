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
const ZEBRA = rgb(0.975, 0.98, 0.99);
const ACCENT = rgb(0.06, 0.28, 0.5);
const PAGE_W = 612;
const PAGE_H = 792;
const M = 40;
const LH = 1.3; // line-height multiplier

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  // Respect explicit newlines, then word-wrap each segment.
  const out: string[] = [];
  for (const segment of String(text).split(/\n/)) {
    const words = segment.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        line = test;
      } else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

function wrapClamp(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines = wrap(text, font, size, maxWidth);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  // Trim last line and append ellipsis so it fits.
  let s = last;
  while (s.length > 0 && font.widthOfTextAtSize(s + "…", size) > maxWidth) {
    s = s.slice(0, -1);
  }
  kept[maxLines - 1] = s + "…";
  return kept;
}

/** Draws text and returns the y-position immediately below the block. */
function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: {
    font: PDFFont;
    size: number;
    color?: ReturnType<typeof rgb>;
    maxWidth?: number;
    maxLines?: number;
    align?: "left" | "right";
  },
): number {
  const { font, size, color = INK, maxWidth, maxLines, align = "left" } = opts;
  const lines = maxWidth
    ? (maxLines ? wrapClamp(text, font, size, maxWidth, maxLines) : wrap(text, font, size, maxWidth))
    : [text];
  const lineHeight = size * LH;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dx = align === "right" && maxWidth
      ? x + maxWidth - font.widthOfTextAtSize(line, size)
      : x;
    page.drawText(line, { x: dx, y: y - (i + 1) * lineHeight + lineHeight * 0.25, font, size, color });
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
  // Label (small, uppercase-ish muted)
  page.drawText(label.toUpperCase(), {
    x, y: y - 8, size: 6.8, font: helvB, color: MUTED,
  });
  const yVal = y - 8 - 12;
  const end = drawText(page, value, x, yVal + 9.5 * LH * 0.75, {
    font: helv, size: 9.5, color: INK, maxWidth: colW,
  });
  return end - 8;
}

/** Two-line KV variant that renders line2 in muted style (used for emergency contact). */
function drawKV2(
  page: PDFPage,
  label: string,
  line1: string,
  line2: string | null,
  x: number,
  y: number,
  colW: number,
  helv: PDFFont,
  helvB: PDFFont,
): number {
  page.drawText(label.toUpperCase(), {
    x, y: y - 8, size: 6.8, font: helvB, color: MUTED,
  });
  let cursor = y - 8 - 12 + 9.5 * LH * 0.75;
  cursor = drawText(page, line1, x, cursor, {
    font: helv, size: 9.5, color: INK, maxWidth: colW,
  });
  if (line2) {
    cursor = drawText(page, line2, x, cursor, {
      font: helv, size: 9, color: MUTED, maxWidth: colW,
    });
  }
  return cursor - 8;
}

function sectionHeader(
  page: PDFPage,
  title: string,
  x: number,
  y: number,
  w: number,
  helvB: PDFFont,
): number {
  const barH = 16;
  page.drawRectangle({ x, y: y - barH, width: w, height: barH, color: rgb(0.945, 0.96, 0.975) });
  page.drawRectangle({ x, y: y - barH, width: 2.5, height: barH, color: ACCENT });
  page.drawText(title.toUpperCase(), {
    x: x + 10, y: y - barH + 5.5, size: 7.8, font: helvB, color: ACCENT,
  });
  return y - barH - 6;
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
  let leftBottom = headerTop;
  if (logoImg) {
    const maxH = 44;
    const scale = maxH / logoImg.height;
    const w = Math.min(170, logoImg.width * scale);
    const h = logoImg.height * (w / logoImg.width);
    page.drawImage(logoImg, { x: M, y: headerTop - h, width: w, height: h });
    leftBottom = headerTop - h;
  } else {
    const end = drawText(page, orgName, M, headerTop, {
      font: helvB, size: 18, color: INK, maxWidth: 320, maxLines: 1,
    });
    leftBottom = end;
  }

  const rightColW = 220;
  const rightX = PAGE_W - M - rightColW;
  let ry = headerTop;
  ry = drawText(page, orgName, rightX, ry, {
    font: helvB, size: 9.5, color: INK, maxWidth: rightColW, maxLines: 1, align: "right",
  });
  ry -= 2;
  ry = drawText(page, field(d.branding?.org_address), rightX, ry, {
    font: helv, size: 8.5, color: MUTED, maxWidth: rightColW, maxLines: 2, align: "right",
  });
  ry -= 1;
  ry = drawText(page, field(d.branding?.org_phone), rightX, ry, {
    font: helv, size: 8.5, color: MUTED, maxWidth: rightColW, maxLines: 1, align: "right",
  });

  let y = Math.min(leftBottom, ry) - 14;
  hr(page, y);
  y -= 16;

  // ── Identity band ─────────────────────────────────────────────────────
  const photoBoxSize = 92;
  const photoX = PAGE_W - M - photoBoxSize;
  const identityTop = y;
  const photoY = identityTop - photoBoxSize;
  page.drawRectangle({
    x: photoX, y: photoY, width: photoBoxSize, height: photoBoxSize,
    borderColor: BORDER, borderWidth: 0.75,
  });
  if (photoImg) {
    const box = photoBoxSize - 4;
    const scale = Math.max(box / photoImg.width, box / photoImg.height);
    const w = photoImg.width * scale;
    const h = photoImg.height * scale;
    // Clip via a second rectangle mask isn't available in pdf-lib; center-crop by
    // drawing scaled image inside the box bounds via image scaling only.
    page.drawImage(photoImg, {
      x: photoX + (photoBoxSize - w) / 2,
      y: photoY + (photoBoxSize - h) / 2,
      width: w, height: h,
    });
  } else {
    drawText(page, "No photo on file", photoX, photoY + photoBoxSize / 2 + 4, {
      font: helv, size: 8.5, color: MUTED, maxWidth: photoBoxSize, align: "left",
    });
  }

  const idW = photoX - M - 20;
  let iy = identityTop;
  iy = drawText(page, "EMPLOYEE FACE SHEET", M, iy, {
    font: helvB, size: 8, color: ACCENT, maxWidth: idW,
  });
  iy -= 4;
  iy = drawText(page, name, M, iy, {
    font: helvB, size: 22, color: INK, maxWidth: idW, maxLines: 2,
  });
  iy -= 4;
  const orgTitle = d.staffTypeLabels.length
    ? (d.staffTypeLabels.length <= 3
        ? d.staffTypeLabels.join(" / ")
        : `${d.staffTypeLabels[0]} and ${d.staffTypeLabels.length - 1} more`)
    : EMPTY;
  iy = drawText(page, orgTitle, M, iy, {
    font: helv, size: 10.5, color: INK, maxWidth: idW, maxLines: 1,
  });
  iy -= 2;
  const roleLine = `${String(d.member.role ?? "").toUpperCase()}  ·  ${d.member.active ? "Active" : "Deactivated"}`;
  iy = drawText(page, roleLine, M, iy, {
    font: helvB, size: 7.8, color: ACCENT, maxWidth: idW, maxLines: 1,
  });

  y = Math.min(iy, photoY) - 14;
  hr(page, y);
  y -= 14;

  // ── Two-column identity / employment ─────────────────────────────────
  const colGap = 20;
  const colW = (PAGE_W - M * 2 - colGap) / 2;
  const rightXCol = M + colW + colGap;

  let yL = y;
  yL = sectionHeader(page, "Identity & contact", M, yL, colW, helvB);
  yL = drawKV(page, "Email", field(p.email), M, yL, colW, helv, helvB);
  yL = drawKV(page, "Phone", field(p.phone), M, yL, colW, helv, helvB);
  yL = drawKV(page, "Employee ID", field(p.employee_id), M, yL, colW, helv, helvB);
  {
    const nm = field(p.emergency_contact_name);
    const rel = field(p.emergency_contact_relationship);
    const ph = field(p.emergency_contact_phone);
    const line1 = nm === EMPTY && rel === EMPTY
      ? EMPTY
      : (rel !== EMPTY ? `${nm} (${rel})` : nm);
    const line2 = ph !== EMPTY ? `Phone: ${ph}` : null;
    yL = drawKV2(page, "Emergency contact", line1, line2, M, yL, colW, helv, helvB);
  }

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
  y -= 14;

  // ── Table renderer with page-break support ────────────────────────────
  function ensureSpace(needed: number): void {
    if (y - needed < 60) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  }

  let rowIndex = 0;
  function resetRows(): void { rowIndex = 0; }

  function drawRow(
    cells: string[],
    widths: number[],
    aligns: Array<"left" | "right">,
    opts: { header?: boolean } = {},
  ): void {
    const header = !!opts.header;
    const font = header ? helvB : helv;
    const size = header ? 7.8 : 9;
    const color = header ? MUTED : INK;
    const padX = 8;
    const padY = 6;

    // Pre-wrap all cells to compute row height.
    const wrapped = cells.map((c, i) => wrap(c, font, size, widths[i] - padX * 2));
    const lineCount = Math.max(...wrapped.map((w) => w.length));
    const rowH = lineCount * size * LH + padY * 2;

    ensureSpace(rowH + 2);

    if (header) {
      page.drawRectangle({
        x: M, y: y - rowH, width: PAGE_W - M * 2, height: rowH, color: rgb(0.95, 0.955, 0.965),
      });
    } else if (rowIndex % 2 === 1) {
      page.drawRectangle({
        x: M, y: y - rowH, width: PAGE_W - M * 2, height: rowH, color: ZEBRA,
      });
    }

    let x = M;
    for (let i = 0; i < cells.length; i++) {
      const lines = wrapped[i];
      const align = aligns[i];
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const dx = align === "right"
          ? x + widths[i] - padX - font.widthOfTextAtSize(line, size)
          : x + padX;
        page.drawText(line, {
          x: dx,
          y: y - padY - (li + 1) * size * LH + size * LH * 0.25,
          font, size, color,
        });
      }
      x += widths[i];
    }
    y -= rowH;
    page.drawLine({
      start: { x: M, y }, end: { x: PAGE_W - M, y },
      thickness: 0.25, color: BORDER,
    });
    if (!header) rowIndex++;
  }

  // ── Certifications & trainings ────────────────────────────────────────
  ensureSpace(48);
  y = sectionHeader(page, "Certifications & trainings", M, y, PAGE_W - M * 2, helvB);
  {
    const dateW = 78;
    const sourceW = 108;
    const labelW = PAGE_W - M * 2 - sourceW - dateW * 2;
    const widths = [labelW, sourceW, dateW, dateW];
    const aligns: Array<"left" | "right"> = ["left", "left", "right", "right"];
    resetRows();
    drawRow(["Credential", "Source", "Issued", "Expires"], widths, aligns, { header: true });
    if (d.certs.length === 0) {
      ensureSpace(18);
      drawText(page, EMPTY, M + 8, y, { font: helv, size: 9, color: MUTED });
      y -= 18;
    } else {
      for (const c of d.certs) {
        drawRow([c.label, c.source, fmtDate(c.issued), fmtDate(c.expires)], widths, aligns);
      }
    }
  }
  y -= 10;

  // ── Deadlines (next 90 days) ─────────────────────────────────────────
  ensureSpace(48);
  y = sectionHeader(page, "Deadlines · next 90 days", M, y, PAGE_W - M * 2, helvB);
  {
    const dateW = 90;
    const sourceW = 120;
    const labelW = PAGE_W - M * 2 - sourceW - dateW;
    const widths = [labelW, sourceW, dateW];
    const aligns: Array<"left" | "right"> = ["left", "left", "right"];
    resetRows();
    drawRow(["Item", "Source", "Expires"], widths, aligns, { header: true });
    if (d.deadlines.length === 0) {
      ensureSpace(18);
      drawText(page, "No credentials expiring in the next 90 days.", M + 8, y, {
        font: helv, size: 9, color: MUTED,
      });
      y -= 18;
    } else {
      for (const dl of d.deadlines) {
        drawRow([dl.label, dl.source, fmtDate(dl.expires)], widths, aligns);
      }
    }
  }
  y -= 10;

  // ── HR documents ─────────────────────────────────────────────────────
  ensureSpace(48);
  y = sectionHeader(page, "HR documents on file", M, y, PAGE_W - M * 2, helvB);
  {
    const dateW = 78;
    const kindW = 96;
    const statusW = 80;
    const labelW = PAGE_W - M * 2 - kindW - dateW - statusW;
    const widths = [labelW, kindW, dateW, statusW];
    const aligns: Array<"left" | "right"> = ["left", "left", "right", "left"];
    resetRows();
    drawRow(["Document", "Kind", "Uploaded", "Status"], widths, aligns, { header: true });
    if (d.hrDocs.length === 0) {
      ensureSpace(18);
      drawText(page, "No HR documents on file.", M + 8, y, {
        font: helv, size: 9, color: MUTED,
      });
      y -= 18;
    } else {
      for (const doc of d.hrDocs) {
        drawRow(
          [
            doc.title ?? doc.file_name ?? "(untitled)",
            field(doc.kind),
            fmtDate(doc.uploaded_at),
            field(doc.status ?? "current"),
          ],
          widths,
          aligns,
        );
      }
    }
  }

  // ── Footer on every page ─────────────────────────────────────────────
  const pages = pdf.getPages();
  const genStr = generatedAt.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    const footerY = 34;
    pg.drawLine({
      start: { x: M, y: footerY + 14 }, end: { x: PAGE_W - M, y: footerY + 14 },
      thickness: 0.5, color: BORDER,
    });
    pg.drawText(`Employee Face Sheet  ·  ${name}  ·  ${orgName}`, {
      x: M, y: footerY + 4, size: 7.5, font: helvB, color: INK,
    });
    const meta = `Generated ${genStr}   ·   Page ${i + 1} of ${pages.length}`;
    const metaW = helv.widthOfTextAtSize(meta, 7.5);
    pg.drawText(meta, {
      x: PAGE_W - M - metaW, y: footerY + 4, size: 7.5, font: helv, color: MUTED,
    });
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
