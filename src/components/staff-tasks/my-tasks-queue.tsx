import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { STAFF_TASKS_FOOTER, type StaffTask, type StaffTaskActionKind } from "@/lib/staff-my-tasks";
import { OVERRIDE_STATE_LABEL, OVERRIDE_STILL_REQUIRED } from "@/lib/obligations/overrides";

export function MyTasksQueue({
  tasks,
  staffLabel,
  variant = "page",
  emptyLabel = "Nothing needs you right now.",
  onAction,
}: {
  tasks: StaffTask[];
  staffLabel?: string | null;
  variant?: "page" | "home";
  emptyLabel?: string;
  onAction: (task: StaffTask, action: StaffTaskActionKind) => void;
}) {
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
  const shown = variant === "home" ? tasks.slice(0, 6) : tasks;
  const extra = variant === "home" ? Math.max(0, tasks.length - shown.length) : 0;

  return (
    <section data-testid="my-tasks" className="space-y-3">
      <div>
        <h2
          className={
            variant === "home"
              ? "text-base font-semibold text-foreground"
              : "text-xl font-semibold tracking-tight text-foreground sm:text-2xl md:hidden"
          }
        >
          My tasks
        </h2>
        {staffLabel ? <p className="mt-0.5 text-sm text-muted-foreground">{staffLabel}</p> : null}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="grid gap-3">
          {shown.map((task) => (
            <li
              key={task.instanceId}
              data-testid="my-task-row"
              className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold leading-snug">{task.title}</p>
                  {task.pendingReview ? (
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Pending review
                    </p>
                  ) : null}
                  {task.overridden ? (
                    <p
                      data-testid="override-state"
                      className="text-sm font-medium text-amber-800 dark:text-amber-200"
                    >
                      {OVERRIDE_STATE_LABEL}
                      {task.overrideUntil ? ` until ${task.overrideUntil}` : ""}.{" "}
                      {OVERRIDE_STILL_REQUIRED}
                    </p>
                  ) : null}
                  {task.progressLabel ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{task.progressLabel}</p>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{
                            width: progressWidth(task.progressLabel),
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                  <p
                    className={`text-sm font-medium ${task.overdue ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {task.dueText}
                  </p>
                  <button
                    type="button"
                    className="text-left text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() =>
                      setWhyOpen((cur) => (cur === task.instanceId ? null : task.instanceId))
                    }
                  >
                    Why is this required?
                  </button>
                  {whyOpen === task.instanceId ? (
                    <p className="text-sm text-muted-foreground">{task.whyRequired}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  data-testid="my-task-action"
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  onClick={() => onAction(task, task.action)}
                >
                  {task.actionLabel}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {extra > 0 ? (
        <Link
          to="/dashboard/my-obligations"
          className="inline-flex text-sm font-medium text-[var(--hive-ink)] underline-offset-2 hover:underline"
        >
          {extra} more on Staff file
        </Link>
      ) : null}
      <p data-testid="my-tasks-footer" className="text-xs text-muted-foreground">
        {STAFF_TASKS_FOOTER}
      </p>
    </section>
  );
}

function progressWidth(label: string): string {
  const match = /^(\d+) of (\d+)/.exec(label);
  if (!match) return "0%";
  const done = Number(match[1]);
  const total = Number(match[2]);
  if (!total) return "0%";
  return `${Math.min(100, Math.round((done / total) * 100))}%`;
}
