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
