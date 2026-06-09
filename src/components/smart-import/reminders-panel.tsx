import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BellRing, ChevronRight, Check, Loader2 } from "lucide-react";
import {
  listSmartImportReminders,
  resolveSmartImportReminder,
} from "@/lib/smart-import-reminders.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Reminder = {
  id: string;
  type: string;
  urgency: "normal" | "urgent" | "critical";
  title: string;
  body: string;
  link_to: string | null;
  related_type: string | null;
  created_at: string;
};

interface Props {
  /** When set, only show reminders that point at this committed record id. */
  relatedRecordId?: string;
  /** scope: 'admin' (default) hides per-user staff reminders. */
  scope?: "admin" | "mine";
  className?: string;
  compact?: boolean;
}

/**
 * Smart Import recurring reminders surface. Advisory only — never blocks.
 * Reuses the existing `notifications` table; resolving here only stops the
 * nag — the recurring sweep re-creates the reminder if the underlying item
 * is still unresolved.
 */
export function SmartImportRemindersPanel({
  relatedRecordId,
  scope = "admin",
  className,
  compact,
}: Props) {
  const list = useServerFn(listSmartImportReminders);
  const resolve = useServerFn(resolveSmartImportReminder);
  const qc = useQueryClient();

  const key = ["smart-import-reminders", scope, relatedRecordId ?? "all"];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => list({ data: { scope, relatedRecordId } }),
    staleTime: 30_000,
  });

  const resolveM = useMutation({
    mutationFn: (id: string) => resolve({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["smart-import-reminders"] });
      toast.success("Reminder cleared. It'll come back if the item still needs attention.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't clear reminder"),
  });

  const reminders = (data?.reminders ?? []) as Reminder[];
  if (isLoading) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reminders…
        </div>
      </div>
    );
  }
  if (reminders.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-600">
        <BellRing className="h-4 w-4" /> Smart Import — Setup reminders
        <Badge variant="outline" className="ml-1 text-[10px]">{reminders.length}</Badge>
      </h2>
      <ul className="space-y-2">
        {reminders.map((r) => {
          const tone =
            r.urgency === "critical"
              ? "border-l-rose-500"
              : r.urgency === "urgent"
                ? "border-l-amber-500"
                : "border-l-primary";
          return (
            <li
              key={r.id}
              className={`flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between ${tone} border-l-4`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {r.urgency !== "normal" && (
                    <AlertTriangle className={r.urgency === "critical" ? "h-3.5 w-3.5 text-rose-600" : "h-3.5 w-3.5 text-amber-600"} />
                  )}
                  <div className="text-sm font-semibold">{r.title}</div>
                </div>
                {!compact && r.body && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.body}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {r.link_to && (
                  <Button asChild size="sm" variant="outline" className="min-h-[36px]">
                    <Link to={r.link_to as "/dashboard"}>
                      Open <ChevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[36px]"
                  onClick={() => resolveM.mutate(r.id)}
                  disabled={resolveM.isPending}
                >
                  <Check className="mr-1 h-3 w-3" /> Done
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
