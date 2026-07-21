// Pure authorization helpers for the audit portal — no framework imports, so
// they can be unit tested directly against a mocked Supabase client instead
// of only being exercised through the TanStack server-fn/middleware stack.

export async function assertOrgAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  userId: string,
): Promise<void> {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin", "manager"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden — org admin/manager only");
}

/**
 * Resolve an audit package's owning organization and verify the caller may
 * touch it: either an admin/manager of that organization, or (when
 * `allowAuditor` is set) an active auditor with non-revoked access to a
 * released/closed package. Mirrors the RLS policies on audit_packages /
 * audit_package_access, but is enforced here explicitly rather than relying
 * solely on RLS (supabase/migrations/ may not match the live DB — see
 * CLAUDE.md).
 */
export async function assertPackageAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  auditPackageId: string,
  opts: { allowAuditor?: boolean } = {},
): Promise<{ organizationId: string }> {
  const { data: pkg } = await supabase
    .from("audit_packages")
    .select("id, organization_id, status")
    .eq("id", auditPackageId)
    .maybeSingle();
  if (!pkg) throw new Error("Package not found");
  const p = pkg as { id: string; organization_id: string; status: string };

  const { data: adminRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", p.organization_id)
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin", "manager"])
    .maybeSingle();
  if (adminRow) return { organizationId: p.organization_id };

  if (opts.allowAuditor && (p.status === "released" || p.status === "closed")) {
    const { data: auditor } = await supabase
      .from("auditor_accounts")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();
    const aud = auditor as { id: string; status: string } | null;
    if (aud && aud.status === "active") {
      const { data: access } = await supabase
        .from("audit_package_access")
        .select("id")
        .eq("audit_package_id", auditPackageId)
        .eq("auditor_account_id", aud.id)
        .is("revoked_at", null)
        .maybeSingle();
      if (access) return { organizationId: p.organization_id };
    }
  }

  throw new Error("Forbidden — you do not have access to this audit package");
}

/** Same as assertPackageAccess, but starting from a row in a child table
 * that references audit_package_id (subjects, access, folders, files). */
export async function assertPackageAccessViaChild(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  table: string,
  rowId: string,
  opts: { allowAuditor?: boolean } = {},
): Promise<{ organizationId: string; auditPackageId: string }> {
  const { data: row } = await supabase
    .from(table)
    .select("audit_package_id")
    .eq("id", rowId)
    .maybeSingle();
  if (!row) throw new Error("Not found");
  const auditPackageId = (row as { audit_package_id: string }).audit_package_id;
  const { organizationId } = await assertPackageAccess(supabase, userId, auditPackageId, opts);
  return { organizationId, auditPackageId };
}
