/**
 * Server-side billing lock. Reads org + org_subscriptions with the signed-in
 * session first (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — the names the
 * host already has). Uses the service-role client only when that env is
 * already present — never requires it, never invents a new name.
 *
 * Missing org_subscriptions row still locks (fail-closed). An active paid
 * row the admin can SELECT unlocks. True North stays unlocked via
 * isBillingExempt. No PHI in logs.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isBillingExempt, orgAccessIsLocked } from "@/lib/billing-access";
import {
  isComplimentaryMembership,
  pickUnlockedMembership,
  type MembershipPick,
} from "@/lib/current-org";
import { readSupabaseAdminEnv } from "@/lib/supabase-public-env";
import type { Role } from "@/lib/rbac";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type LockOrgRow = {
  name: string | null;
  legalName: string | null;
  dbaName: string | null;
  billingExempt: boolean;
};

type LockSubRow = {
  status: string | null;
  locked_at: string | null;
  stripe_subscription_id: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readLockOrg(db: any, orgId: string): Promise<LockOrgRow | null> {
  const full = await db
    .from("organizations")
    .select("name, legal_name, dba_name, billing_exempt")
    .eq("id", orgId)
    .maybeSingle();
  if (!full.error && full.data) {
    const row = full.data as {
      name: string | null;
      legal_name: string | null;
      dba_name: string | null;
      billing_exempt?: boolean;
    };
    return {
      name: row.name,
      legalName: row.legal_name,
      dbaName: row.dba_name,
      billingExempt: row.billing_exempt === true,
    };
  }
  const fallback = await db
    .from("organizations")
    .select("name, legal_name, dba_name")
    .eq("id", orgId)
    .maybeSingle();
  if (fallback.error || !fallback.data) return null;
  const row = fallback.data as {
    name: string | null;
    legal_name: string | null;
    dba_name: string | null;
  };
  return {
    name: row.name,
    legalName: row.legal_name,
    dbaName: row.dba_name,
    billingExempt: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readLockSub(db: any, orgId: string): Promise<LockSubRow | null> {
  const { data: sub } = await db
    .from("org_subscriptions")
    .select("status, locked_at, stripe_subscription_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!sub) return null;
  return {
    status: (sub.status as string | null) ?? null,
    locked_at: (sub.locked_at as string | null) ?? null,
    stripe_subscription_id:
      (sub as { stripe_subscription_id?: string | null }).stripe_subscription_id ?? null,
  };
}

export const getBillingLockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { organizationId?: string | null }) => {
    const organizationId = String(input?.organizationId ?? "");
    return { organizationId: UUID_RE.test(organizationId) ? organizationId : "" };
  })
  .handler(async ({ data, context }) => {
    const empty = {
      locked: false,
      isAdmin: false,
      orgId: null as string | null,
      status: null as string | null,
      billingExempt: false,
    };
    if (!context.supabase || !context.userId) return empty;

    const { data: memberships } = await context.supabase
      .from("organization_members")
      .select("organization_id, role, organizations(name, is_demo, display_acronym)")
      .eq("user_id", context.userId)
      .eq("active", true);
    const ms = (memberships ?? []) as Array<{
      organization_id: string;
      role: string;
      organizations?: {
        name?: string | null;
        is_demo?: boolean | null;
        display_acronym?: string | null;
      } | null;
    }>;
    if (ms.length === 0) return empty;

    const picks: MembershipPick[] = ms.map((m) => ({
      organization_id: m.organization_id,
      is_demo: m.organizations?.is_demo === true,
      role: m.role as Role,
      display_acronym: m.organizations?.display_acronym ?? null,
      organization_name: m.organizations?.name ?? null,
    }));

    const lockById = new Map<string, boolean>();
    for (const p of picks) {
      if (isComplimentaryMembership(p)) lockById.set(p.organization_id, false);
    }
    const needIds = picks.filter((p) => !lockById.has(p.organization_id)).map((p) => p.organization_id);
    if (needIds.length) {
      const orgById = new Map<string, LockOrgRow>();
      const subById = new Map<string, LockSubRow>();
      const { data: orgRows } = await context.supabase
        .from("organizations")
        .select("id, name, legal_name, dba_name, billing_exempt")
        .in("id", needIds);
      for (const row of (orgRows ?? []) as Array<{
        id: string;
        name: string | null;
        legal_name: string | null;
        dba_name: string | null;
        billing_exempt?: boolean;
      }>) {
        orgById.set(row.id, {
          name: row.name,
          legalName: row.legal_name,
          dbaName: row.dba_name,
          billingExempt: row.billing_exempt === true,
        });
      }
      const { data: subRows } = await context.supabase
        .from("org_subscriptions")
        .select("organization_id, status, locked_at, stripe_subscription_id")
        .in("organization_id", needIds);
      for (const row of (subRows ?? []) as Array<{
        organization_id: string;
        status: string | null;
        locked_at: string | null;
        stripe_subscription_id?: string | null;
      }>) {
        subById.set(row.organization_id, {
          status: row.status,
          locked_at: row.locked_at,
          stripe_subscription_id: row.stripe_subscription_id ?? null,
        });
      }
      if (readSupabaseAdminEnv()) {
        const missingOrg = needIds.filter((id) => !orgById.has(id));
        const missingSub = needIds.filter((id) => !subById.has(id));
        if (missingOrg.length || missingSub.length) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            for (const id of missingOrg) {
              const org = await readLockOrg(supabaseAdmin, id);
              if (org) orgById.set(id, org);
            }
            for (const id of missingSub) {
              const sub = await readLockSub(supabaseAdmin, id);
              if (sub) subById.set(id, sub);
            }
          } catch {
            /* preview often has VITE_ keys only */
          }
        }
      }
      for (const p of picks) {
        if (lockById.has(p.organization_id)) continue;
        const orgRow = orgById.get(p.organization_id);
        const subRow = subById.get(p.organization_id) ?? null;
        lockById.set(
          p.organization_id,
          orgAccessIsLocked({
            billingExempt: orgRow?.billingExempt ?? false,
            orgName: orgRow?.name ?? p.organization_name,
            legalName: orgRow?.legalName,
            dbaName: orgRow?.dbaName,
            organizationId: p.organization_id,
            displayAcronym: p.display_acronym,
            subscription: subRow,
          }),
        );
      }
    }

    const chosen = pickUnlockedMembership(
      picks,
      (m) => lockById.get(m.organization_id) ?? true,
      data.organizationId,
    );
    const orgId = chosen?.organization_id ?? picks[0]?.organization_id ?? "";
    if (!orgId) return empty;
    const membership = ms.find((m) => m.organization_id === orgId) ?? ms[0];
    const isAdmin = membership?.role === "admin";

    let org = await readLockOrg(context.supabase, orgId);
    let sub = await readLockSub(context.supabase, orgId);

    if ((!org || !sub) && readSupabaseAdminEnv()) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!org) org = await readLockOrg(supabaseAdmin, orgId);
        if (!sub) sub = await readLockSub(supabaseAdmin, orgId);
      } catch {
        /* preview often has VITE_ keys only — session row is enough */
      }
    }

    if (!org) {
      return { locked: true, isAdmin, orgId, status: null, billingExempt: false };
    }

    const billingExempt = isBillingExempt({
      billingExempt: org.billingExempt,
      orgName: org.name,
      legalName: org.legalName,
      dbaName: org.dbaName,
      organizationId: orgId,
    });
    const locked = orgAccessIsLocked({
      billingExempt,
      orgName: org.name,
      legalName: org.legalName,
      dbaName: org.dbaName,
      organizationId: orgId,
      subscription: sub,
    });

    return {
      locked,
      isAdmin,
      orgId,
      status: sub?.status ?? null,
      billingExempt,
    };
  });
