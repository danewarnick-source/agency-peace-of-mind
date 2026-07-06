/**
 * useComplianceGate — the one-line wrapper every entry surface uses.
 *
 *   const gate = useComplianceGate({ detectionType, detector, buildInput, buildSubject });
 *   await gate(payload, async () => { await mySurface.insert(...) });
 *
 * Contract:
 *   1. Runs the registered detector (see nectar-compliance.detectors.ts).
 *   2. 0 candidates ⇒ runs commit directly.
 *   3. ≥1 candidate ⇒ opens <ComplianceFlagDialog>. The dialog raises each
 *      flag and writes the resolution (acknowledged_continued | stopped)
 *      via existing server fns. On "proceed" we run commit. On "stopped"
 *      we skip commit — the flag rows already hold the audit trail.
 *
 * Surfaces never touch nectar_compliance_flags or the raise/resolve fns
 * directly. Detector and dialog are the only seams.
 */
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { complianceDetectors, detectionTypeFor, type ComplianceDetectorKey } from "@/lib/nectar-compliance.detectors";
import { ComplianceFlagDialog, type CandidateFlag } from "@/components/nectar/compliance-flag-dialog";

type DetectorInput = Record<string, unknown>;
type SubjectContext = Record<string, unknown>;

export type UseComplianceGateOptions<P> = {
  organizationId: string;
  detector: ComplianceDetectorKey;
  buildInput: (payload: P) => DetectorInput;
  buildSubject: (payload: P) => SubjectContext;
};

export function useComplianceGate<P>(opts: UseComplianceGateOptions<P>) {
  const detectorFn = useServerFn(complianceDetectors[opts.detector]);
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    candidates: CandidateFlag[];
    subject: SubjectContext;
    resolve: (decision: "proceed" | "stopped") => void;
  } | null>(null);

  const gate = useCallback(
    async (payload: P, commit: () => Promise<unknown>) => {
      const input = { ...opts.buildInput(payload), organizationId: opts.organizationId };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await detectorFn({ data: input as any })) as { flags: CandidateFlag[] };
      const flags = result?.flags ?? [];
      if (flags.length === 0) {
        return await commit();
      }
      const decision = await new Promise<"proceed" | "stopped">((resolve) => {
        setDialogState({
          open: true,
          candidates: flags,
          subject: opts.buildSubject(payload),
          resolve,
        });
      });
      setDialogState((s) => (s ? { ...s, open: false } : s));
      if (decision === "stopped") return { stopped: true } as const;
      return await commit();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.organizationId, opts.detector],
  );

  const dialogElement = dialogState ? (
    <ComplianceFlagDialog
      open={dialogState.open}
      onOpenChange={(v) => {
        if (!v && dialogState) dialogState.resolve("stopped");
      }}
      organizationId={opts.organizationId}
      detectionType={detectionTypeFor[opts.detector]}
      subjectContext={dialogState.subject}
      candidates={dialogState.candidates}
      onDecision={(d) => dialogState.resolve(d)}
    />
  ) : null;

  return { gate, dialogElement };
}
