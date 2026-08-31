import { clientFormKindForTitle } from "./client-form-obligations.ts";
import { isUnlinkedFormDuty } from "./resolve-obligation-form.ts";

export type StaffObligationAttentionInstance = {
  id: string;
  status: string;
  client_id: string | null;
  obligation: {
    title: string;
    evidence_type: string;
    linked_form_id?: string | null;
  };
};

export type ObligationCompletionLite = {
  instance_id: string;
  nectar_validation_status: string | null;
};

export type ClientTrainingStatusLite = {
  items?: Array<{
    clientId: string;
    trainings?: Array<{
      type: string;
      setupStatus: string;
      completionStatus: string;
    }>;
  }>;
};

/**
 * Same count as Staff My Obligations "All (N)": open assigned duties
 * (pending / overdue / action required, including failed Nectar review)
 * plus published per-client trainings that are not yet done and not already
 * covered by an instance. Unlinked form duties are excluded — staff cannot act.
 */
export function countStaffObligationsNeedingAttention(
  instances: StaffObligationAttentionInstance[],
  completions: ObligationCompletionLite[],
  clientTrainings: ClientTrainingStatusLite | null | undefined,
): number {
  const completionByInstance = new Map(
    completions.map((row) => [row.instance_id, row]),
  );
  const formDoneByClientKind = new Set<string>();
  for (const item of clientTrainings?.items ?? []) {
    for (const training of item.trainings ?? []) {
      if (training.setupStatus === "published" && training.completionStatus === "completed") {
        formDoneByClientKind.add(`${item.clientId}:${training.type}`);
      }
    }
  }

  const covered = new Set<string>();
  let open = 0;
  for (const inst of instances) {
    const kind = clientFormKindForTitle(inst.obligation.title);
    if (kind && inst.client_id) covered.add(`${inst.client_id}:${kind}`);
    const completion = completionByInstance.get(inst.id);
    const failedValidation = completion?.nectar_validation_status === "failed";
    const formAlreadyDone =
      !!kind && !!inst.client_id && formDoneByClientKind.has(`${inst.client_id}:${kind}`);
    const done =
      inst.status === "completed" ||
      inst.status === "waived" ||
      formAlreadyDone ||
      (!!completion && !failedValidation);
    if (done) continue;
    if (isUnlinkedFormDuty(inst.obligation)) continue;
    open += 1;
  }

  let overlayDue = 0;
  for (const item of clientTrainings?.items ?? []) {
    for (const training of item.trainings ?? []) {
      if (training.setupStatus !== "published") continue;
      const key = `${item.clientId}:${training.type}`;
      if (covered.has(key)) continue;
      if (training.completionStatus !== "completed") overlayDue += 1;
    }
  }

  return open + overlayDue;
}
