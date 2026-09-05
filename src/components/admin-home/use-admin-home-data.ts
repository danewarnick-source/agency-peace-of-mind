/**
 * Admin Home data — recovered from 0a8f11df.
 *
 * Two org-scoped queries only:
 *   1. company_obligation_instances + nested obligations / assignees / completions
 *   2. active clients (authorized_dspd_codes lives on clients)
 *
 * company_obligations has no `category` column. Area grouping uses the SOW
 * catalog overlay keyed by obligation title.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import {
  addDaysYmd,
  asMany,
  daysBetweenYmd,
  denverYmd,
  formatDenverLongDate,
  INSTANCES_SELECT,
  isComplete,
  obligationScope,
  obligationTitle,
  selectAdminHomeStaffStatus,
  sessionFirstName,
  sowSection,
  type ClientRow,
  type InstanceRow,
} from "@/lib/admin-home-data";
import {
  CATEGORY_LABEL,
  sowCatalogEntry,
  type ObligationCategory,
} from "@/lib/sow-obligation-catalog";
import { adminHomeClientsQueryKey, adminHomeInstancesQueryKey } from "@/lib/yield-to-admin-home";

export {
  addDaysYmd,
  denverYmd,
  formatDueDate,
  greetingWord,
  initials,
  INSTANCES_SELECT,
  isComplete,
  nextBillingWindowLabel,
  selectAdminHomeStaffStatus,
  sessionFirstName,
} from "@/lib/admin-home-data";
export type { ClientRow, InstanceRow, StaffRow } from "@/lib/admin-home-data";

export type Recommendation = { key: string; text: string };

export type OverdueItem = {
  id: string;
  title: string;
  assignee: string;
  days: number;
};

export type PendingItem = {
  id: string;
  title: string;
  sow: string;
  dueAt: string;
  dueYmd: string;
};

export type AreaRow = { label: string; completed: number; total: number };

export function categoryFor(row: InstanceRow): { key: string; label: string } {
  const title = obligationTitle(row);
  const catalog = sowCatalogEntry(title);
  if (catalog) {
    return { key: catalog.category, label: CATEGORY_LABEL[catalog.category] };
  }
  return { key: "other", label: "Other" };
}

function catalogCategory(row: InstanceRow): ObligationCategory | null {
  return sowCatalogEntry(obligationTitle(row))?.category ?? null;
}

function isCredentialTitle(title: string): boolean {
  return /cert|cpr|first aid|license|credential|screening|background/i.test(title);
}

function looksLikeTraining(row: InstanceRow): boolean {
  const title = obligationTitle(row);
  return catalogCategory(row) === "training" || /training/i.test(title);
}

function looksLikeCredential(row: InstanceRow): boolean {
  const cat = catalogCategory(row);
  return cat === "screening" || cat === "licensing" || isCredentialTitle(obligationTitle(row));
}

export function buildRecommendations(instances: InstanceRow[], todayYmd: string): Recommendation[] {
  const horizon = addDaysYmd(todayYmd, 14);
  const recs: Recommendation[] = [];

  const overdueByObligation = new Map<string, { title: string; staff: Set<string> }>();
  const overdueByStaff = new Map<string, { name: string; obligations: Set<string> }>();
  const clientTrainingPairs = new Set<string>();

  for (const row of instances) {
    const complete = isComplete(row);
    const dueYmd = denverYmd(new Date(row.due_at));
    const overdue = !complete && dueYmd < todayYmd;
    const assignees = asMany(row.company_obligation_instance_assignees);
    const title = obligationTitle(row);

    if (overdue) {
      const bucket = overdueByObligation.get(row.obligation_id) ?? {
        title,
        staff: new Set<string>(),
      };
      for (const a of assignees) bucket.staff.add(a.staff_id);
      overdueByObligation.set(row.obligation_id, bucket);

      for (const a of assignees) {
        const staff = overdueByStaff.get(a.staff_id) ?? {
          name: a.staff_name,
          obligations: new Set<string>(),
        };
        staff.obligations.add(row.obligation_id);
        overdueByStaff.set(a.staff_id, staff);
      }

      if (looksLikeTraining(row)) {
        const instanceClient = row.client_id;
        for (const a of assignees) {
          const clientId = a.client_id ?? instanceClient;
          if (!clientId) continue;
          if (obligationScope(row) === "staff_per_client" || a.client_id || instanceClient) {
            clientTrainingPairs.add(`${a.staff_id}:${clientId}`);
          }
        }
      }
    }
  }

  for (const [obligationId, group] of overdueByObligation) {
    if (group.staff.size >= 3) {
      recs.push({
        key: `group-${obligationId}`,
        text: `Schedule a group session for ${group.title} — ${group.staff.size} staff share this overdue item.`,
      });
    }
  }

  for (const [staffId, staff] of overdueByStaff) {
    if (staff.obligations.size >= 3) {
      recs.push({
        key: `checkin-${staffId}`,
        text: `Check in with ${staff.name} — ${staff.obligations.size} overdue obligations.`,
      });
    }
  }

  const expiring = new Set<string>();
  for (const row of instances) {
    const title = obligationTitle(row);
    for (const c of asMany(row.company_obligation_completions)) {
      const expires = c.nectar_extracted_expires_date;
      if (!expires) continue;
      const expYmd = expires.slice(0, 10);
      if (expYmd >= todayYmd && expYmd <= horizon) {
        expiring.add(c.nectar_extracted_cert_type?.trim() || title);
      }
    }
    if (!isComplete(row) && looksLikeCredential(row)) {
      const dueYmd = denverYmd(new Date(row.due_at));
      if (dueYmd >= todayYmd && dueYmd <= horizon) {
        expiring.add(title);
      }
    }
  }
  if (expiring.size > 0) {
    const label = [...expiring][0];
    recs.push({
      key: "credential-window",
      text:
        expiring.size === 1
          ? `${label} expires within 14 days. Start processing now — credential turnaround often needs the full window.`
          : `${expiring.size} credentials expire within 14 days. Start processing now — turnaround often needs the full window.`,
    });
  }

  if (clientTrainingPairs.size >= 3) {
    recs.push({
      key: "client-training",
      text: `Schedule a group session for client-specific training — ${clientTrainingPairs.size} staff-and-client pairs are overdue.`,
    });
  }

  return recs;
}

export function deriveAdminHome(instances: InstanceRow[], todayYmd: string, plus30Ymd: string) {
  const overdue: OverdueItem[] = [];
  const pending: PendingItem[] = [];
  const staffWithOverdue = new Set<string>();
  let pendingWithin30 = 0;
  const area = new Map<string, AreaRow>();

  for (const row of instances) {
    const complete = isComplete(row);
    const dueYmd = denverYmd(new Date(row.due_at));
    const assignees = asMany(row.company_obligation_instance_assignees);
    const title = obligationTitle(row);
    const cat = categoryFor(row);
    const bucket = area.get(cat.key) ?? { label: cat.label, completed: 0, total: 0 };
    bucket.total += 1;
    if (complete) bucket.completed += 1;
    area.set(cat.key, bucket);

    const isOverdue = !complete && dueYmd < todayYmd;
    const isPending = !complete && dueYmd >= todayYmd;

    for (const a of assignees) {
      if (isOverdue) staffWithOverdue.add(a.staff_id);
    }

    if (isOverdue) {
      overdue.push({
        id: row.id,
        title,
        assignee: assignees[0]?.staff_name?.trim() || "Unassigned",
        days: daysBetweenYmd(dueYmd, todayYmd),
      });
    } else if (isPending) {
      pending.push({
        id: row.id,
        title,
        sow: sowSection(row),
        dueAt: row.due_at,
        dueYmd,
      });
      if (dueYmd <= plus30Ymd) pendingWithin30 += 1;
    }
  }

  overdue.sort((a, b) => b.days - a.days);
  pending.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  const staff = selectAdminHomeStaffStatus(instances, todayYmd);
  const areas = [...area.values()].sort((a, b) => a.label.localeCompare(b.label));
  const recommendations = buildRecommendations(instances, todayYmd);

  return {
    overdue,
    pending,
    staff,
    staffWithOverdue: staffWithOverdue.size,
    pendingWithin30,
    areas,
    recommendations,
  };
}

export function useAdminHomeData() {
  const { user } = useAuth();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const orgName = org?.organization_name ?? "Your agency";

  const instancesQ = useQuery({
    enabled: !!orgId,
    queryKey: adminHomeInstancesQueryKey(orgId),
    queryFn: async () => {
      if (!orgId) return [] as InstanceRow[];
      const { data, error } = await (supabase as any)
        .from("company_obligation_instances")
        .select(INSTANCES_SELECT)
        .eq("organization_id", orgId);
      if (error) throw error;
      return (data ?? []) as InstanceRow[];
    },
    staleTime: 30_000,
  });

  const clientsQ = useQuery({
    enabled: !!orgId,
    queryKey: adminHomeClientsQueryKey(orgId),
    queryFn: async () => {
      if (!orgId) return [] as ClientRow[];
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, authorized_dspd_codes")
        .eq("organization_id", orgId)
        .eq("account_status", "active")
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
    staleTime: 30_000,
  });

  const now = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => denverYmd(now), [now]);
  const plus30Ymd = useMemo(() => addDaysYmd(todayYmd, 30), [todayYmd]);

  const instances = instancesQ.data ?? [];
  const clients = clientsQ.data ?? [];

  const derived = useMemo(
    () => deriveAdminHome(instances, todayYmd, plus30Ymd),
    [instances, plus30Ymd, todayYmd],
  );

  return {
    org,
    orgId,
    orgName,
    orgLoading,
    user,
    now,
    todayYmd,
    plus30Ymd,
    instancesQ,
    clientsQ,
    instances,
    clients,
    derived,
    firstName: sessionFirstName(user),
    dateLine: formatDenverLongDate(now),
    plus14Ymd: addDaysYmd(todayYmd, 14),
    topOverdue: derived.overdue.slice(0, 4),
    dueSoon: derived.pending.slice(0, 4),
    instancesReady: instancesQ.isSuccess,
    instancesFailed: instancesQ.isError,
    instancesLoading: !instancesQ.isSuccess && !instancesQ.isError,
    clientsReady: clientsQ.isSuccess,
    clientsFailed: clientsQ.isError,
    clientsLoading: !clientsQ.isSuccess && !clientsQ.isError,
  };
}
