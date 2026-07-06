/**
 * Reusable flag → resolve dialog. Detection callers open this after
 * `checkBillingEntry` (or any other detector) returns candidate flags.
 * The provider chooses Acknowledge & continue OR Stop. Every decision is
 * persisted append-only to nectar_compliance_flags.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  raiseComplianceFlag,
  resolveComplianceFlag,
} from "@/lib/nectar-compliance.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export type CandidateFlag = {
  ruleId: string;
  requirementId: string;
  matchedCodes: string[];
  humanExplanation: string;
  source: { title: string; verbatim: string; citation: string | null };
};

export function ComplianceFlagDialog({
  open,
  onOpenChange,
  organizationId,
  detectionType,
  subjectContext,
  candidates,
  onDecision,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  detectionType: "billing_conflict" | "staff_prerequisite" | "deadline" | "activity";
  subjectContext: Record<string, unknown>;
  candidates: CandidateFlag[];
  /** Called after every candidate has a decision. Decision applies to the entry as a whole. */
  onDecision: (finalDecision: "proceed" | "stopped") => void;
}) {
  const raise = useServerFn(raiseComplianceFlag);
  const resolve = useServerFn(resolveComplianceFlag);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [decided, setDecided] = useState<Record<string, "acknowledged_continued" | "stopped">>({});

  const decide = useMutation({
    mutationFn: async (args: { cand: CandidateFlag; resolution: "acknowledged_continued" | "stopped" }) => {
      const flag = await raise({
        data: {
          organizationId,
          ruleId: args.cand.ruleId,
          requirementId: args.cand.requirementId,
          detectionType,
          subjectContext: { ...subjectContext, matchedCodes: args.cand.matchedCodes },
          sourceSnapshot: args.cand.source,
        },
      });
      await resolve({
        data: {
          flagId: (flag as { id: string }).id,
          resolution: args.resolution,
          note: notes[args.cand.ruleId] || undefined,
        },
      });
      return args;
    },
    onSuccess: ({ cand, resolution }) => {
      setDecided((d) => ({ ...d, [cand.ruleId]: resolution }));
      toast.success(resolution === "stopped" ? "Stopped and logged" : "Acknowledged and logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allDecided = candidates.every((c) => decided[c.ruleId]);
  const anyStopped = candidates.some((c) => decided[c.ruleId] === "stopped");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            NECTAR: this entry appears to conflict with an obligation you confirmed
          </DialogTitle>
          <DialogDescription>
            NECTAR flags; you decide. Every choice is logged with who, when, and the source it derived from.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {candidates.map((c) => {
            const d = decided[c.ruleId];
            return (
              <div key={c.ruleId} className="border rounded-md p-3 space-y-2 bg-card">
                <div className="text-sm">
                  <span className="font-medium">Your source states:</span>
                  <blockquote className="mt-1 pl-3 border-l-2 border-amber-500 italic text-muted-foreground">
                    "{c.source.verbatim}"
                  </blockquote>
                  {c.source.citation && (
                    <div className="text-xs text-muted-foreground mt-1">— {c.source.citation}</div>
                  )}
                </div>
                <div className="text-sm">{c.humanExplanation}</div>
                <div className="flex gap-1 flex-wrap">
                  {c.matchedCodes.map((code) => (
                    <Badge key={code} variant="outline" className="text-xs font-mono">{code}</Badge>
                  ))}
                </div>

                {!d ? (
                  <>
                    <Textarea
                      value={notes[c.ruleId] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [c.ruleId]: e.target.value }))}
                      placeholder="Optional note explaining your decision"
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex gap-2 justify-end pt-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => decide.mutate({ cand: c, resolution: "stopped" })}
                        disabled={decide.isPending}
                      >
                        Stop
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => decide.mutate({ cand: c, resolution: "acknowledged_continued" })}
                        disabled={decide.isPending}
                      >
                        Acknowledge & continue
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground pt-1">
                    Recorded: <span className="font-medium">{d === "stopped" ? "Stopped" : "Acknowledged & continued"}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={!allDecided}
          >
            Close
          </Button>
          <Button
            onClick={() => {
              onDecision(anyStopped ? "stopped" : "proceed");
              onOpenChange(false);
            }}
            disabled={!allDecided}
          >
            {anyStopped ? "Return without saving entry" : "Continue with entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
