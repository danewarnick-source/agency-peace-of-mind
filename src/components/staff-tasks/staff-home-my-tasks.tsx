import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  listMyObligationInstances,
  type MyObligationInstanceRow,
} from "@/lib/company-obligations.functions";
import { isPackSentinel, obligationIsRequired } from "@/lib/obligation-packs";
import { isUnlinkedFormDuty, isFormUuid } from "@/lib/resolve-obligation-form";
import { inHiveCourseIdForTitle, topicCodesForCourse } from "@/lib/in-hive-training";
import { clientFormKindForTitle } from "@/lib/client-form-obligations";
import {
  completedCodesFromProgress,
  loadInHiveCourseProgress,
} from "@/lib/in-hive-training.functions";
import { supabase } from "@/integrations/supabase/client";
import { toDisplayNameCase } from "@/lib/person-name";
import { buildStaffTask } from "@/lib/staff-my-tasks";
import { MyTasksQueue } from "@/components/staff-tasks/my-tasks-queue";

function resolveTitle(row: MyObligationInstanceRow): string {
  if (row.obligation.scope === "staff_per_client" && row.client_name) {
    return row.obligation.title.replace("[Client Name]", toDisplayNameCase(row.client_name));
  }
  return row.obligation.title;
}

export function StaffHomeMyTasks() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const navigate = useNavigate();
  const listFn = useServerFn(listMyObligationInstances);

  const listQ = useQuery({
    enabled: !!orgId && !!user,
    queryKey: ["my-obligation-instances", orgId, user?.id],
    queryFn: () => listFn({ data: { organizationId: orgId! } }),
    staleTime: 30_000,
  });

  const instances = useMemo(
    () =>
      (Array.isArray(listQ.data) ? listQ.data : []).filter(
        (row) =>
          !isPackSentinel(row.obligation) &&
          !isUnlinkedFormDuty(row.obligation) &&
          obligationIsRequired(row.obligation) &&
          row.status !== "completed" &&
          row.status !== "waived",
      ),
    [listQ.data],
  );

  const instanceIds = instances.map((i) => i.id);
  const completionsQ = useQuery({
    enabled: !!user && instanceIds.length > 0,
    queryKey: ["my-obligation-completions", orgId, user?.id, instanceIds],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_obligation_completions")
        .select("instance_id, nectar_validation_status, admin_notes")
        .eq("staff_id", user!.id)
        .in("instance_id", instanceIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        instance_id: string;
        nectar_validation_status: string | null;
        admin_notes: string | null;
      }>;
    },
  });

  const courseRows = instances.filter((row) => inHiveCourseIdForTitle(row.obligation.title));
  const progressQ = useQuery({
    enabled: !!user && courseRows.length > 0,
    queryKey: ["in-hive-progress-home", user?.id, courseRows.map((r) => r.id).join(",")],
    queryFn: async () => {
      const out = new Map<string, { completed: number; total: number }>();
      for (const row of courseRows) {
        const courseId = inHiveCourseIdForTitle(row.obligation.title);
        if (!courseId) continue;
        const codes = topicCodesForCourse(courseId);
        const progress = await loadInHiveCourseProgress(user!.id, courseId, codes);
        const done = completedCodesFromProgress(codes, progress);
        out.set(row.id, { completed: done.size, total: codes.length });
      }
      return out;
    },
  });

  const completionByInstance = useMemo(() => {
    const m = new Map<string, { nectar_validation_status: string | null; admin_notes: string | null }>();
    for (const row of completionsQ.data ?? []) m.set(row.instance_id, row);
    return m;
  }, [completionsQ.data]);

  const tasks = instances
    .filter((row) => completionByInstance.get(row.id)?.nectar_validation_status !== "passed")
    .map((row) =>
      buildStaffTask({
        instanceId: row.id,
        title: resolveTitle(row),
        description: row.obligation.description,
        source: row.obligation.source,
        sourcePolicySection: row.obligation.source_policy_section,
        evidenceType: row.obligation.evidence_type,
        linkedFormId: row.obligation.linked_form_id,
        dueAt: row.due_at,
        instanceStatus: row.status,
        nectarValidationStatus: completionByInstance.get(row.id)?.nectar_validation_status,
        correctionRequested: String(completionByInstance.get(row.id)?.admin_notes ?? "").startsWith(
          "Correction requested:",
        ),
        courseProgress: progressQ.data?.get(row.id) ?? null,
      }),
    );

  if (!orgId || !user) return null;
  if (listQ.isLoading || (instances.length > 0 && completionsQ.isLoading)) return null;
  if (tasks.length === 0) return null;

  return (
    <MyTasksQueue
      variant="home"
      tasks={tasks}
      staffLabel="Staff"
      onAction={(task) => {
        const inst = instances.find((row) => row.id === task.instanceId);
        if (!inst) return;
        const formKind = clientFormKindForTitle(inst.obligation.title);
        if (task.action === "take_training" || task.action === "continue_training") {
          void navigate({
            to: "/dashboard/my-obligations/course/$instanceId",
            params: { instanceId: inst.id },
          });
          return;
        }
        if (task.action === "complete_form" && formKind && inst.client_id) {
          void navigate({
            to: "/dashboard/client-training/$clientId",
            params: { clientId: inst.client_id },
            search: { trainingType: formKind, obligation_instance: inst.id },
          });
          return;
        }
        if (task.action === "complete_form" && isFormUuid(inst.obligation.linked_form_id)) {
          window.location.href = `/dashboard/forms/${inst.obligation.linked_form_id}/fill?obligation_instance=${inst.id}`;
          return;
        }
        void navigate({ to: "/dashboard/my-obligations" });
      }}
    />
  );
}
