import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Loader2, ListChecks, Sparkles, PlayCircle, MessageSquare, Check, Trash2, X } from "lucide-react";
import { listNectarGuides, planNectarGuide, updateGuideTask, deleteGuide, type Guide, type GuideTask } from "@/lib/nectar-guide.functions";
import { useGuidedTour } from "@/components/nectar/guided-tour-provider";
import { useCurrentOrg } from "@/hooks/use-org";
import { toast } from "sonner";

interface Props {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional pre-filled goal (e.g. detected from chat). */
  initialGoal?: string;
}

export function NectarTaskCenter({ trigger, open, onOpenChange, initialGoal }: Props) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? "";
  const role = org?.role ?? "employee";
  const list = useServerFn(listNectarGuides);
  const plan = useServerFn(planNectarGuide);
  const upd = useServerFn(updateGuideTask);
  const del = useServerFn(deleteGuide);
  const qc = useQueryClient();
  const tour = useGuidedTour();
  const [goal, setGoal] = useState(initialGoal ?? "");
  const [explainFor, setExplainFor] = useState<GuideTask | null>(null);

  const guidesQ = useQuery({
    queryKey: ["nectar-guides", orgId],
    enabled: !!orgId && !!open,
    queryFn: () => list({ data: { orgId } }),
  });

  const planM = useMutation({
    mutationFn: (g: string) => plan({ data: { goal: g, role, orgId, surface: "admin" } }),
    onSuccess: () => {
      setGoal("");
      qc.invalidateQueries({ queryKey: ["nectar-guides", orgId] });
      toast.success("NECTAR built your task list.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't build plan"),
  });

  const updM = useMutation({
    mutationFn: (v: { taskId: string; status?: GuideTask["status"]; currentStep?: number }) =>
      upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nectar-guides", orgId] }),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { guideId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nectar-guides", orgId] }),
  });

  function startTour(task: GuideTask) {
    onOpenChange?.(false);
    updM.mutate({ taskId: task.id, status: "in_progress" });
    tour.start(task, {
      onComplete: () => {
        updM.mutate({ taskId: task.id, status: "done", currentStep: task.steps.length });
        toast.success(`Done: ${task.title}`);
      },
      onStepChange: (i) => updM.mutate({ taskId: task.id, currentStep: i }),
    });
  }

  const body = (
    <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-0">
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-[#fbfaf7] px-5 py-4">
          <SheetTitle className="flex items-center gap-2 font-display text-lg font-bold text-[#0f1b3d]">
            <ListChecks className="h-5 w-5 text-[#d97a1c]" /> NECTAR Task Center
          </SheetTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Tell NECTAR a goal and it'll build a shared task list, then walk you through each step.
          </p>
        </div>

        <div className="space-y-3 border-b border-border bg-white px-5 py-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What do you want help with?
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            placeholder="e.g. Help me prepare for my DSPD audit"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#d97a1c]/40"
          />
          <button
            onClick={() => goal.trim().length >= 3 && planM.mutate(goal.trim())}
            disabled={planM.isPending || goal.trim().length < 3 || !orgId}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-[#d97a1c] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#b8651a] disabled:opacity-60"
          >
            {planM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Build my task list
          </button>
        </div>

        <div className="flex-1 space-y-3 px-5 py-4">
          {guidesQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your guides…
            </div>
          )}
          {guidesQ.data && guidesQ.data.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-[#fbfaf7] p-4 text-center text-xs text-muted-foreground">
              No guided plans yet — describe a goal above to start.
            </p>
          )}
          {guidesQ.data?.map((g) => (
            <GuideCard
              key={g.id}
              guide={g}
              onStartTour={startTour}
              onExplain={(t) => setExplainFor(t)}
              onMarkDone={(t) => updM.mutate({ taskId: t.id, status: "done" })}
              onDelete={() => delM.mutate(g.id)}
            />
          ))}
        </div>
      </div>

      {explainFor && (
        <ExplainModal task={explainFor} onClose={() => setExplainFor(null)} />
      )}
    </SheetContent>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      {body}
    </Sheet>
  );
}

function GuideCard({
  guide, onStartTour, onExplain, onMarkDone, onDelete,
}: {
  guide: Guide;
  onStartTour: (t: GuideTask) => void;
  onExplain: (t: GuideTask) => void;
  onMarkDone: (t: GuideTask) => void;
  onDelete: () => void;
}) {
  const done = guide.tasks.filter((t) => t.status === "done").length;
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#d97a1c]">Guide</div>
          <div className="truncate font-display text-sm font-bold text-[#0f1b3d]">{guide.goal}</div>
          {guide.summary && <p className="mt-0.5 text-xs text-muted-foreground">{guide.summary}</p>}
          <div className="mt-1 text-[11px] text-muted-foreground">{done} of {guide.tasks.length} complete</div>
        </div>
        <button onClick={onDelete} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Delete guide">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="divide-y divide-border">
        {guide.tasks.map((t) => {
          const hasSteps = t.steps.length > 0;
          return (
            <li key={t.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <button
                  onClick={() => onMarkDone(t)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    t.status === "done"
                      ? "border-[#0f1b3d] bg-[#0f1b3d] text-white"
                      : "border-border bg-white hover:border-[#d97a1c]"
                  }`}
                  aria-label="Mark done"
                >
                  {t.status === "done" && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold ${t.status === "done" ? "text-muted-foreground line-through" : "text-[#0f1b3d]"}`}>
                    {t.position + 1}. {t.title}
                  </div>
                  {t.why && <p className="mt-0.5 text-[11px] text-muted-foreground">{t.why}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => onExplain(t)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-[11px] hover:bg-muted"
                    >
                      <MessageSquare className="h-3 w-3" /> Explain
                    </button>
                    <button
                      onClick={() => onStartTour(t)}
                      disabled={!hasSteps || t.status === "done"}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-[#d97a1c] px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-[#b8651a] disabled:opacity-50"
                      title={hasSteps ? "" : "No on-screen steps — read the explanation."}
                    >
                      <PlayCircle className="h-3 w-3" /> Show me
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ExplainModal({ task, onClose }: { task: GuideTask; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-w-md rounded-xl border border-[#fed7aa] bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#d97a1c]">NECTAR · Explain</div>
            <h3 className="font-display text-base font-bold text-[#0f1b3d]">{task.title}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {task.why && <p className="mb-3 text-sm text-muted-foreground">{task.why}</p>}
        {task.steps.length > 0 ? (
          <ol className="space-y-2 text-sm text-[#0f1b3d]">
            {task.steps.map((s, i) => (
              <li key={i} className="rounded-md border border-border bg-[#fbfaf7] px-3 py-2">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-[#d97a1c]">Step {i + 1}</span>
                {s.instruction}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm italic text-muted-foreground">No on-screen steps for this task — see the description above.</p>
        )}
      </div>
    </div>
  );
}
