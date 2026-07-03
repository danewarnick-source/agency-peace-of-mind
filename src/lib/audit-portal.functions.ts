import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAuditPackageData, type AuditPackagePayload } from "@/lib/audit-package-data";

// ============================================================
// Types
// ============================================================
export interface AuditorContext {
  auditor_account_id: string;
  email: string;
  full_name: string;
  agency_name: string;
  status: "active" | "revoked";
}

export interface AuditPackageRow {
  id: string;
  organization_id: string;
  organization_name?: string;
  state_agency: string;
  status: "draft" | "released" | "closed";
  date_range_start: string;
  date_range_end: string;
  title: string | null;
  created_at: string;
  released_at: string | null;
  subject_count: number;
  auditor_count: number;
}

export interface AuditPackageSubjectRow {
  id: string;
  subject_type: "staff" | "client";
  subject_id: string;
  subject_label: string | null;
}

export interface AuditPackageAccessRow {
  id: string;
  auditor_account_id: string;
  auditor_email: string;
  auditor_name: string;
  auditor_agency: string;
  granted_at: string;
  revoked_at: string | null;
}

// ============================================================
// Auditor identity
// ============================================================

/**
 * Resolve the current user's auditor account (or null if they aren't one).
 * Used by the /audit-portal layout to gate access.
 */
export const getAuditorContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditorContext | null> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("auditor_accounts")
      .select("id, email, full_name, agency_name, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; email: string; full_name: string; agency_name: string; status: string };
    if (row.status !== "active") return null;
    return {
      auditor_account_id: row.id,
      email: row.email,
      full_name: row.full_name,
      agency_name: row.agency_name,
      status: row.status as "active" | "revoked",
    };
  });

// ============================================================
// Org-side: package management (admin/manager only via RLS)
// ============================================================

async function assertOrgAdmin(
  supabase: unknown,
  organizationId: string,
  userId: string,
): Promise<void> {
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            in: (c: string, v: string[]) => {
              maybeSingle: () => Promise<{ data: unknown }>;
            };
          };
        };
      };
    };
  };
  const { data } = await sb
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin", "manager"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden — org admin/manager only");
}

export const listOrgAuditPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AuditPackageRow[]> => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organizationId, userId);

    const { data: rows } = await supabase
      .from("audit_packages")
      .select("id, organization_id, state_agency, status, date_range_start, date_range_end, title, created_at, released_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });

    const list = (rows ?? []) as Array<Omit<AuditPackageRow, "subject_count" | "auditor_count" | "organization_name">>;
    if (list.length === 0) return [];

    const pkgIds = list.map((p) => p.id);
    const [subj, acc] = await Promise.all([
      supabase.from("audit_package_subjects").select("audit_package_id").in("audit_package_id", pkgIds),
      supabase.from("audit_package_access").select("audit_package_id, revoked_at").in("audit_package_id", pkgIds),
    ]);

    const subjCount = new Map<string, number>();
    for (const s of ((subj.data ?? []) as Array<{ audit_package_id: string }>)) {
      subjCount.set(s.audit_package_id, (subjCount.get(s.audit_package_id) ?? 0) + 1);
    }
    const accCount = new Map<string, number>();
    for (const a of ((acc.data ?? []) as Array<{ audit_package_id: string; revoked_at: string | null }>)) {
      if (a.revoked_at) continue;
      accCount.set(a.audit_package_id, (accCount.get(a.audit_package_id) ?? 0) + 1);
    }

    return list.map((p) => ({
      ...p,
      subject_count: subjCount.get(p.id) ?? 0,
      auditor_count: accCount.get(p.id) ?? 0,
    }));
  });

export const createAuditPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      stateAgency: z.string().min(1).max(200),
      title: z.string().max(200).optional(),
      dateRangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dateRangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organizationId, userId);

    const { data: row, error } = await (supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
        };
      };
    })
      .from("audit_packages")
      .insert({
        organization_id: data.organizationId,
        created_by: userId,
        state_agency: data.stateAgency,
        title: data.title ?? null,
        date_range_start: data.dateRangeStart,
        date_range_end: data.dateRangeEnd,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row!.id };
  });

export const addPackageSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      auditPackageId: z.string().uuid(),
      subjectType: z.enum(["staff", "client"]),
      subjectId: z.string().uuid(),
      subjectLabel: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { error } = await supabase
      .from("audit_package_subjects")
      .upsert(
        {
          audit_package_id: data.auditPackageId,
          subject_type: data.subjectType,
          subject_id: data.subjectId,
          subject_label: data.subjectLabel ?? null,
        },
        { onConflict: "audit_package_id,subject_type,subject_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const removePackageSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ subjectRowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("audit_package_subjects")
      .delete()
      .eq("id", data.subjectRowId);
    if (error) throw error;
    return { ok: true };
  });

export const releaseAuditPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ auditPackageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("audit_packages")
      .update({ status: "released", released_at: new Date().toISOString() })
      .eq("id", data.auditPackageId);
    if (error) throw error;
    return { ok: true };
  });

export const grantAuditorAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      auditPackageId: z.string().uuid(),
      auditorAccountId: z.string().uuid(),
      siteOrigin: z.string().url().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("audit_package_access")
      .upsert(
        {
          audit_package_id: data.auditPackageId,
          auditor_account_id: data.auditorAccountId,
          granted_by: userId,
          granted_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "audit_package_id,auditor_account_id" },
      );
    if (error) throw error;

    // Package-specific invite email — sends the auditor a fresh set-password
    // link that lands on /audit-portal/set-password?packageId=…, so they end
    // up directly on the granted package, never the HIVE homepage.
    try {
      await sendAuditorPackageInvite({
        supabase,
        auditPackageId: data.auditPackageId,
        auditorAccountId: data.auditorAccountId,
        siteOrigin: data.siteOrigin ?? "",
      });
    } catch (e) {
      // Non-fatal — access is granted; the email can be resent from the UI.
      console.error("Auditor invite email failed:", e);
    }
    return { ok: true };
  });

export const revokeAuditorAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accessRowId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("audit_package_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.accessRowId);
    if (error) throw error;
    return { ok: true };
  });

export const getPackageBuilderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ auditPackageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{
    package: AuditPackageRow;
    subjects: AuditPackageSubjectRow[];
    access: AuditPackageAccessRow[];
    availableAuditors: Array<{ id: string; email: string; full_name: string; agency_name: string }>;
  }> => {
    const { supabase } = context;

    const { data: pkg, error: pkgErr } = await supabase
      .from("audit_packages")
      .select("id, organization_id, state_agency, status, date_range_start, date_range_end, title, created_at, released_at")
      .eq("id", data.auditPackageId)
      .single();
    if (pkgErr || !pkg) throw new Error("Package not found");

    const [{ data: subj }, { data: acc }, { data: auditors }] = await Promise.all([
      supabase.from("audit_package_subjects").select("id, subject_type, subject_id, subject_label").eq("audit_package_id", data.auditPackageId),
      supabase.from("audit_package_access").select("id, auditor_account_id, granted_at, revoked_at").eq("audit_package_id", data.auditPackageId),
      supabase.from("auditor_accounts").select("id, email, full_name, agency_name, status").eq("status", "active"),
    ]);

    const auditorList = (auditors ?? []) as Array<{ id: string; email: string; full_name: string; agency_name: string; status: string }>;
    const auditorMap = new Map(auditorList.map((a) => [a.id, a]));

    const accessRows: AuditPackageAccessRow[] = ((acc ?? []) as Array<{ id: string; auditor_account_id: string; granted_at: string; revoked_at: string | null }>).map((a) => {
      const aud = auditorMap.get(a.auditor_account_id);
      return {
        id: a.id,
        auditor_account_id: a.auditor_account_id,
        auditor_email: aud?.email ?? "(deleted)",
        auditor_name: aud?.full_name ?? "(deleted)",
        auditor_agency: aud?.agency_name ?? "",
        granted_at: a.granted_at,
        revoked_at: a.revoked_at,
      };
    });

    return {
      package: {
        ...(pkg as Omit<AuditPackageRow, "subject_count" | "auditor_count">),
        subject_count: (subj ?? []).length,
        auditor_count: accessRows.filter((a) => !a.revoked_at).length,
      },
      subjects: (subj ?? []) as AuditPackageSubjectRow[],
      access: accessRows,
      availableAuditors: auditorList.map((a) => ({ id: a.id, email: a.email, full_name: a.full_name, agency_name: a.agency_name })),
    };
  });

/**
 * Org-side picker lists — staff + clients for the current org, minimal fields.
 */
export const listOrgSubjectCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{
    staff: Array<{ id: string; label: string }>;
    clients: Array<{ id: string; label: string }>;
  }> => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organizationId, userId);

    const [{ data: members }, { data: clients }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", data.organizationId)
        .eq("active", true),
      supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", data.organizationId)
        .limit(500),
    ]);

    const memberIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
    let staff: Array<{ id: string; label: string }> = [];
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberIds);
      staff = ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((p) => ({
        id: p.id,
        label: p.full_name ?? p.email ?? p.id.slice(0, 8),
      }));
    }

    const clientList = ((clients ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).map((c) => ({
      id: c.id,
      label: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.id.slice(0, 8),
    }));

    return { staff, clients: clientList };
  });

// ============================================================
// Auditor-side: view granted packages
// ============================================================

export const listMyAuditPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditPackageRow[]> => {
    const { supabase, userId } = context;

    // Resolve auditor account
    const { data: auditor } = await supabase
      .from("auditor_accounts")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();
    const audRow = auditor as { id: string; status: string } | null;
    if (!audRow || audRow.status !== "active") return [];

    const { data: access } = await supabase
      .from("audit_package_access")
      .select("audit_package_id, revoked_at")
      .eq("auditor_account_id", audRow.id)
      .is("revoked_at", null);
    const pkgIds = ((access ?? []) as Array<{ audit_package_id: string }>).map((a) => a.audit_package_id);
    if (pkgIds.length === 0) return [];

    const { data: pkgs } = await supabase
      .from("audit_packages")
      .select("id, organization_id, state_agency, status, date_range_start, date_range_end, title, created_at, released_at")
      .in("id", pkgIds)
      .in("status", ["released", "closed"])
      .order("released_at", { ascending: false });

    const list = (pkgs ?? []) as Array<Omit<AuditPackageRow, "subject_count" | "auditor_count" | "organization_name">>;

    const orgIds = [...new Set(list.map((p) => p.organization_id))];
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    const orgMap = new Map(((orgs ?? []) as Array<{ id: string; name: string }>).map((o) => [o.id, o.name]));

    // subject counts
    const { data: subj } = await supabase
      .from("audit_package_subjects")
      .select("audit_package_id")
      .in("audit_package_id", list.map((p) => p.id));
    const subjCount = new Map<string, number>();
    for (const s of ((subj ?? []) as Array<{ audit_package_id: string }>)) {
      subjCount.set(s.audit_package_id, (subjCount.get(s.audit_package_id) ?? 0) + 1);
    }

    return list.map((p) => ({
      ...p,
      organization_name: orgMap.get(p.organization_id),
      subject_count: subjCount.get(p.id) ?? 0,
      auditor_count: 0,
    }));
  });

/**
 * Auditor's read-only view of a package (goes through the PHI seam).
 */
export const getAuditorPackageView = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ auditPackageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{
    package: {
      id: string;
      state_agency: string;
      title: string | null;
      status: string;
      date_range_start: string;
      date_range_end: string;
      organization_name: string;
    };
    payload: AuditPackagePayload;
  }> => {
    const { supabase } = context;

    // RLS enforces: auditor can only see released/closed granted packages.
    const { data: pkg, error } = await supabase
      .from("audit_packages")
      .select("id, organization_id, state_agency, status, date_range_start, date_range_end, title")
      .eq("id", data.auditPackageId)
      .single();
    if (error || !pkg) throw new Error("Package not found or access revoked");
    const p = pkg as { id: string; organization_id: string; state_agency: string; status: string; date_range_start: string; date_range_end: string; title: string | null };

    const [{ data: subj }, { data: org }] = await Promise.all([
      supabase.from("audit_package_subjects").select("subject_type, subject_id, subject_label").eq("audit_package_id", data.auditPackageId),
      supabase.from("organizations").select("name").eq("id", p.organization_id).single(),
    ]);

    const subjects = ((subj ?? []) as Array<{ subject_type: "staff" | "client"; subject_id: string; subject_label: string | null }>);

    // PHI SEAM — stubbed to seed data until compliant host + BAA.
    const payload = await getAuditPackageData(data.auditPackageId, {
      date_range_start: p.date_range_start,
      date_range_end: p.date_range_end,
      state_agency: p.state_agency,
      subjects,
    });

    return {
      package: {
        id: p.id,
        state_agency: p.state_agency,
        title: p.title,
        status: p.status,
        date_range_start: p.date_range_start,
        date_range_end: p.date_range_end,
        organization_name: (org as { name: string } | null)?.name ?? "—",
      },
      payload,
    };
  });

// ============================================================
// Folders + Files (org admin writes; auditor + org read)
// PHI SEAM — files today are seed/sample only.
// Repoint storage bucket 'audit-files' to compliant-host bucket
// before accepting live client files.
// ============================================================

export interface AuditPackageFolderRow {
  id: string;
  name: string;
  created_at: string;
}

export interface AuditPackageFileRow {
  id: string;
  folder_id: string | null;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}

export const listPackageFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ auditPackageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AuditPackageFolderRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("audit_package_folders")
      .select("id, name, created_at")
      .eq("audit_package_id", data.auditPackageId)
      .order("name", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as AuditPackageFolderRow[];
  });

export const createPackageFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      auditPackageId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
        };
      };
    })
      .from("audit_package_folders")
      .insert({
        audit_package_id: data.auditPackageId,
        name: data.name,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row!.id };
  });

export const deletePackageFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ folderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("audit_package_folders")
      .delete()
      .eq("id", data.folderId);
    if (error) throw error;
    return { ok: true };
  });

export const listPackageFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ auditPackageId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<AuditPackageFileRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("audit_package_files")
      .select("id, folder_id, file_name, content_type, size_bytes, uploaded_by, created_at")
      .eq("audit_package_id", data.auditPackageId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (rows ?? []) as AuditPackageFileRow[];
  });

/**
 * Org admin only. Mints a signed upload URL to the private `audit-files`
 * bucket and inserts an audit_package_files row. Client uploads the actual
 * bytes to Supabase Storage via that signed URL.
 *
 * PHI SEAM — seed/sample files only; repoint bucket before cutover.
 */
export const createPackageFileUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      auditPackageId: z.string().uuid(),
      folderId: z.string().uuid().nullable(),
      fileName: z.string().trim().min(1).max(255),
      contentType: z.string().max(255).optional(),
      sizeBytes: z.number().int().nonnegative().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ fileId: string; path: string; token: string; bucket: string }> => {
    const { supabase, userId } = context;

    // Verify the caller can insert into audit_package_files for this package
    // (RLS covers this — the insert will fail if they're not org admin/manager).
    const { data: pkg, error: pkgErr } = await supabase
      .from("audit_packages")
      .select("id, organization_id")
      .eq("id", data.auditPackageId)
      .single();
    if (pkgErr || !pkg) throw new Error("Package not found or forbidden");
    const p = pkg as { id: string; organization_id: string };

    const bucket = "audit-files";
    const fileId = (globalThis.crypto?.randomUUID?.() ??
      // fallback shouldn't happen in a modern worker
      `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const safeName = data.fileName.replace(/[^\w.\- ]/g, "_");
    const path = `${p.organization_id}/${data.auditPackageId}/${fileId}/${safeName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(path);
    if (signedErr || !signed) throw new Error(signedErr?.message ?? "Failed to sign upload");

    const { data: row, error: insErr } = await (supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
        };
      };
    })
      .from("audit_package_files")
      .insert({
        audit_package_id: data.auditPackageId,
        folder_id: data.folderId,
        file_name: data.fileName,
        storage_bucket: bucket,
        storage_path: path,
        content_type: data.contentType ?? null,
        size_bytes: data.sizeBytes ?? null,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return { fileId: row!.id, path, token: signed.token, bucket };
  });

/**
 * Get a signed download URL for a file. RLS on audit_package_files SELECT
 * enforces: org admin/manager OR an active auditor with granted access.
 * Failing the select = forbidden.
 */
export const getPackageFileDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string; fileName: string }> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("audit_package_files")
      .select("id, storage_bucket, storage_path, file_name")
      .eq("id", data.fileId)
      .maybeSingle();
    if (error || !row) throw new Error("File not found or forbidden");
    const f = row as { storage_bucket: string; storage_path: string; file_name: string };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(f.storage_bucket)
      .createSignedUrl(f.storage_path, 60 * 10);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Failed to sign download");
    return { url: signed.signedUrl, fileName: f.file_name };
  });

export const deletePackageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fileId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("audit_package_files")
      .select("id, storage_bucket, storage_path")
      .eq("id", data.fileId)
      .maybeSingle();
    if (error || !row) throw new Error("File not found or forbidden");
    const f = row as { storage_bucket: string; storage_path: string };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Best-effort storage delete first; row delete is RLS-checked
    await supabaseAdmin.storage.from(f.storage_bucket).remove([f.storage_path]);

    const { error: delErr } = await supabase.from("audit_package_files").delete().eq("id", data.fileId);
    if (delErr) throw delErr;
    return { ok: true };
  });

// ============================================================
// Auditor provisioning (org admin-only)
// ============================================================

export interface OrgAuditorRow {
  id: string;
  email: string;
  full_name: string;
  agency_name: string;
  status: "active" | "revoked";
  created_at: string;
  package_access_count: number;
}

export const listOrgAuditors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<OrgAuditorRow[]> => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organizationId, userId);

    const { data: aud } = await supabase
      .from("auditor_accounts")
      .select("id, email, full_name, agency_name, status, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    const list = (aud ?? []) as Array<Omit<OrgAuditorRow, "package_access_count">>;
    if (list.length === 0) return [];

    const audIds = list.map((a) => a.id);
    const { data: access } = await supabase
      .from("audit_package_access")
      .select("auditor_account_id, revoked_at")
      .in("auditor_account_id", audIds);
    const counts = new Map<string, number>();
    for (const a of ((access ?? []) as Array<{ auditor_account_id: string; revoked_at: string | null }>)) {
      if (a.revoked_at) continue;
      counts.set(a.auditor_account_id, (counts.get(a.auditor_account_id) ?? 0) + 1);
    }
    return list.map((a) => ({ ...a, package_access_count: counts.get(a.id) ?? 0 }));
  });

/**
 * Org admin creates an auditor account, grants access to a specific package,
 * and sends a branded, package-specific invite email (not Supabase's generic
 * app invite). The auditor's set-password link lands them directly on
 * /audit-portal/{packageId} — never the HIVE homepage.
 */

export const provisionOrgAuditor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      organizationId: z.string().uuid(),
      email: z.string().email().max(255),
      fullName: z.string().trim().min(1).max(200),
      agencyName: z.string().trim().min(1).max(200),
      auditPackageId: z.string().uuid(),
      siteOrigin: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ auditorAccountId: string }> => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organizationId, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find or create the auth user WITHOUT sending Supabase's generic invite.
    // We send our own branded, package-specific email below.
    let authUserId: string | null = null;
    const { data: existing } = await (supabaseAdmin.auth.admin as unknown as {
      listUsers: (opts?: { page?: number; perPage?: number }) => Promise<{
        data: { users: Array<{ id: string; email?: string | null }> } | null;
      }>;
    }).listUsers({ page: 1, perPage: 200 });
    const found = existing?.users.find((u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase());
    if (found) {
      authUserId = found.id;
    } else {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        email_confirm: true,
        user_metadata: {
          role: "auditor",
          full_name: data.fullName,
          agency_name: data.agencyName,
          organization_id: data.organizationId,
        },
      });
      if (cErr || !created?.user) throw new Error(cErr?.message ?? "Failed to create auditor auth user");
      authUserId = created.user.id;
    }

    // Upsert auditor_accounts row (org-scoped, no organization_members entry).
    const { data: row, error: upErr } = await (supabase as unknown as {
      from: (t: string) => {
        upsert: (v: Record<string, unknown>, o: { onConflict: string }) => {
          select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
        };
      };
    })
      .from("auditor_accounts")
      .upsert(
        {
          user_id: authUserId,
          email: data.email,
          full_name: data.fullName,
          agency_name: data.agencyName,
          organization_id: data.organizationId,
          provisioned_by: userId,
          status: "active",
        },
        { onConflict: "email" },
      )
      .select("id")
      .single();
    if (upErr) throw upErr;

    // Grant access to the specific package.
    const { error: accErr } = await supabase
      .from("audit_package_access")
      .upsert(
        {
          audit_package_id: data.auditPackageId,
          auditor_account_id: row!.id,
          granted_by: userId,
          granted_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "audit_package_id,auditor_account_id" },
      );
    if (accErr) throw accErr;

    // Send the branded, package-specific invite email.
    await sendAuditorPackageInvite({
      supabase,
      auditPackageId: data.auditPackageId,
      auditorAccountId: row!.id,
      siteOrigin: data.siteOrigin,
    });

    return { auditorAccountId: row!.id };
  });

/**
 * Shared helper: generates a Supabase recovery/invite link scoped to the
 * auditor and sends a branded, package-specific email via the send-email
 * edge function (Resend). The recovery link redirects to
 * /audit-portal/set-password?packageId={id}, so upon password set the
 * auditor lands directly on their granted package — never the HIVE homepage.
 *
 * // notification seam — email/Slack alerts to execs could fire from here.
 */
async function sendAuditorPackageInvite(args: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  auditPackageId: string;
  auditorAccountId: string;
  siteOrigin: string;
}): Promise<void> {
  const { supabase, auditPackageId, auditorAccountId, siteOrigin } = args;

  const [{ data: pkg }, { data: aud }] = await Promise.all([
    supabase
      .from("audit_packages")
      .select("id, title, state_agency, date_range_start, date_range_end, organization_id")
      .eq("id", auditPackageId)
      .maybeSingle(),
    supabase
      .from("auditor_accounts")
      .select("email, full_name")
      .eq("id", auditorAccountId)
      .maybeSingle(),
  ]);
  if (!pkg || !aud) throw new Error("Package or auditor not found");

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", pkg.organization_id)
    .maybeSingle();

  const packageLabel: string = (pkg.title as string | null) ?? `${pkg.state_agency} audit`;
  const orgName: string = (org?.name as string | null) ?? "the provider";

  // Build redirect target: after set-password, land directly on the package.
  const origin = siteOrigin || process.env.PUBLIC_SITE_URL || "";
  const redirectTo = `${origin}/audit-portal/set-password?packageId=${auditPackageId}`;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Generate a recovery link (works for both new and existing users). If the
  // user has never signed in, this doubles as the set-password link.
  const { data: linkData, error: linkErr } = await (supabaseAdmin.auth.admin as unknown as {
    generateLink: (opts: {
      type: "recovery" | "invite";
      email: string;
      options?: { redirectTo?: string };
    }) => Promise<{ data: { properties?: { action_link?: string } } | null; error: { message: string } | null }>;
  }).generateLink({
    type: "recovery",
    email: aud.email as string,
    options: { redirectTo },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    throw new Error(linkErr?.message ?? "Failed to generate auditor invite link");
  }
  const actionLink = linkData.properties.action_link;

  const subject = `You've been invited to view ${packageLabel}`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f1b3d">
      <div style="border-bottom:2px solid #fed7aa;padding-bottom:12px;margin-bottom:20px">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9a3412">HIVE — State Audit Portal</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px">${escapeHtml(packageLabel)}</div>
      </div>
      <p>Hello ${escapeHtml((aud.full_name as string) ?? "auditor")},</p>
      <p>${escapeHtml(orgName)} has released an audit package for your review:
        <strong>${escapeHtml(packageLabel)}</strong>
        (${escapeHtml(pkg.date_range_start as string)} → ${escapeHtml(pkg.date_range_end as string)}).</p>
      <p>Click the button below to set your password and open the package directly. This is a
        read-only auditor portal — it is separate from ${escapeHtml(orgName)}'s regular application.</p>
      <p style="margin:28px 0">
        <a href="${actionLink}"
           style="display:inline-block;background:#0f1b3d;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">
          Set password & open audit package
        </a>
      </p>
      <p style="color:#666;font-size:12px">If the button doesn't work, copy and paste this link into your browser:<br/>
        <span style="word-break:break-all">${actionLink}</span>
      </p>
      <p style="color:#666;font-size:12px;margin-top:24px">
        You received this because a HIVE-provisioned auditor account was created for
        <strong>${escapeHtml(aud.email as string)}</strong>. If you did not expect this,
        you can ignore this email.
      </p>
    </div>
  `;

  const { error: sendErr } = await supabase.functions.invoke("send-email", {
    body: {
      from: "HIVE State Audit <onboarding@resend.dev>",
      to: aud.email,
      subject,
      html,
    },
  });
  if (sendErr) throw new Error(sendErr.message);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const revokeOrgAuditor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: z.string().uuid(), auditorAccountId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    await assertOrgAdmin(supabase, data.organizationId, userId);

    const { error } = await supabase
      .from("auditor_accounts")
      .update({ status: "revoked" })
      .eq("id", data.auditorAccountId)
      .eq("organization_id", data.organizationId);
    if (error) throw error;

    // Also revoke all package access rows for this auditor
    await supabase
      .from("audit_package_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("auditor_account_id", data.auditorAccountId)
      .is("revoked_at", null);
    return { ok: true };
  });
