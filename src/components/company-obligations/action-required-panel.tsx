import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  FileWarning,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import {
  useActionRequiredQueue,
  type ActionRequiredItem,
  type ActionRequiredSection,
  type ActionRequiredTone,
  actionRequiredQueryKey,
} from "@/hooks/use-action-required-queue";
import {
  ObligationCard,
  type ObligationWithInstance,
} from "@/components/company-obligations/obligation-card";
import { ObligationDrawer } from "@/components/company-obligations/obligation-drawer";
import { listStaffGroups, type StaffGroupRow } from "@/lib/staff-groups.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

const toneBorder: Record<ActionRequiredTone, string> = {
  red: "border-l-destructive",
  amber: "border-l-amber-500",
  blue: "border-l-sky-600",
};

const toneIconBg: Record<ActionRequiredTone, string> = {
  red: "bg-destructive/10 text-destructive",
  amber: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  blue: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
};

function categoryIcon(category: ActionRequiredSection["id"]) {
  switch (category) {
    case "overdue_obligations":
      return AlertTriangle;
    case "due_soon_obligations":
      return Clock;
    case "incidents":
      return ShieldAlert;
    case "shift_docs":
      return FileWarning;
    case "staff_hr":
      return UserRound;
    default:
      return ClipboardList;
  }
}

function QueueRow({
  item,
  onObligation,
  onNotifyAttest,
  notifying,
}: {
  item: ActionRequiredItem;
  onObligation: (item: ActionRequiredItem) => void;
  onNotifyAttest: (item: ActionRequiredItem) => void;
  notifying: boolean;
}) {
  const navigate = useNavigate();
  const Icon = categoryIcon(item.category);

  const runPrimary = () => {
    const a = item.action;
    if (a.kind === "obligation") {
      onObligation(item);
      return;
    }
    if (a.kind === "incident") {
      navigate({
        to: "/dashboard/hub/documentation",
        search: {
          tab: "incidents",
          ...(a.clientId ? { client: a.clientId } : {}),
        },
      });
      return;
    }
    if (a.kind === "review_timesheet") {
      navigate({
        to: "/dashboard/compliance-desk",
        search: { focus: a.timesheetId } as never,
      });
      return;
    }
    if (a.kind === "notify_attest") {
      onNotifyAttest(item);
      return;
    }
    if (a.kind === "hrc") {
      navigate({ to: "/dashboard/hrc" });
      return;
    }
    if (a.kind === "hire_dates") {
      navigate({ to: "/dashboard/employees/hire-dates" });
    }
  };

  const buttonLabel = (() => {
    switch (item.action.kind) {
      case "obligation": {
        const et = item.obligation?.evidence_type;
        if (et === "upload" || et === "upload_and_attestation") return "Upload / complete";
        if (et === "attestation") return "Attest / notify";
        if (et === "form") return "Open form";
        return "Complete";
      }
      case "incident":
        return "Open incident";
      case "review_timesheet":
        return "Review";
      case "notify_attest":
        return notifying ? "Notifying…" : "Notify staff";
      case "hrc":
        return "Open HRC";
      case "hire_dates":
        return "Set hire dates →";
      default:
        return "Open";
    }
  })();

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-border border-l-4 bg-card p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between ${toneBorder[item.tone]}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneIconBg[item.tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-foreground">{item.title}</p>
          <p className="text-sm text-muted-foreground">{item.subject}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{item.dueLabel}</p>
        </div>
      </div>
      <Button
        size="sm"
        className="shrink-0 self-stretch sm:self-center"
        disabled={item.action.kind === "notify_attest" && notifying}
        onClick={runPrimary}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}

function SectionBlock({
  section,
  onObligation,
  onNotifyAttest,
  notifyingKey,
}: {
  section: ActionRequiredSection;
  onObligation: (item: ActionRequiredItem) => void;
  onNotifyAttest: (item: ActionRequiredItem) => void;
  notifyingKey: string | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-left hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {section.label}
            <Badge variant="secondary">{section.items.length}</Badge>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {section.items.map((item) => (
          <QueueRow
            key={item.key}
            item={item}
            onObligation={onObligation}
            onNotifyAttest={onNotifyAttest}
            notifying={notifyingKey === item.key}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ActionRequiredPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { sections, totalCount, checkedAt, isLoading, obligations } =
    useActionRequiredQueue(orgId);

  const listGroupsFn = useServerFn(listStaffGroups);
  const { data: groups = [] } = useQuery<Array<StaffGroupRow & { member_count: number }>>({
    queryKey: ["staff-groups", orgId],
    queryFn: () => listGroupsFn({ data: { organizationId: orgId } }),
  });

  const assignedUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const o of obligations) for (const uid of o.assigned_to_users ?? []) s.add(uid);
    return Array.from(s);
  }, [obligations]);

  const { data: userNamesById = new Map<string, string>() } = useQuery({
    queryKey: ["obligation-assignee-names", orgId, assignedUserIds],
    enabled: assignedUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_directory")
        .select("id, full_name")
        .in("id", assignedUserIds);
      if (error) throw new Error(error.message);
      const m = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
        m.set(r.id, r.full_name ?? "Unknown");
      }
      return m;
    },
  });

  const { data: publishedFormIds = new Set<string>() } = useQuery({
    queryKey: ["published-form-ids", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forms")
        .select("id")
        .eq("organization_id", orgId)
        .eq("status", "published");
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((f: { id: string }) => f.id));
    },
  });

  const groupNamesById = useMemo(() => {
    const m = new Map<string, { name: string; member_count: number }>();
    for (const g of groups) m.set(g.id, { name: g.name, member_count: g.member_count });
    return m;
  }, [groups]);

  const [focusObligationId, setFocusObligationId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ObligationWithInstance | null>(null);
  const [notifyingKey, setNotifyingKey] = useState<string | null>(null);

  const focusObligation = useMemo(
    () => obligations.find((o) => o.id === focusObligationId) ?? null,
    [obligations, focusObligationId],
  );

  const notifyAttest = useMutation({
    mutationFn: async (item: ActionRequiredItem) => {
      if (item.action.kind !== "notify_attest") return;
      const today = new Date().toISOString().slice(0, 10);
      const recurrenceKey = `evv_attest_remind_${item.action.timesheetId}_${item.action.staffId}_${today}`;
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("organization_id", orgId)
        .eq("recurrence_key", recurrenceKey)
        .maybeSingle();
      if (existing) return { already: true };
      const { error } = await supabase.from("notifications").insert({
        organization_id: orgId,
        recipient_user_id: item.action.staffId,
        recipient_role: "staff",
        type: "evv_attestation_reminder",
        urgency: "high",
        title: "Please attest your completed shift",
        body: "A recent timesheet is missing your attestation. Open My Historical Records or the punch pad to attest.",
        link_to: "/dashboard/my-historical-records",
        related_id: item.action.timesheetId,
        related_type: "evv_timesheet",
        recurrence_key: recurrenceKey,
      });
      if (error) throw new Error(error.message);
      return { already: false };
    },
    onMutate: (item) => setNotifyingKey(item.key),
    onSettled: () => setNotifyingKey(null),
    onSuccess: (r) => {
      toast.success(r?.already ? "Already notified today" : "Staff notified to attest");
      qc.invalidateQueries({ queryKey: actionRequiredQueryKey(orgId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading urgent items…</p>;
  }

  if (totalCount === 0) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
        <h3 className="text-base font-semibold text-foreground">All clear — no urgent items</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Your organization has no overdue obligations, pending incidents, or flagged documentation.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Last checked{" "}
          {checkedAt.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Prioritized queue of work that needs a human action right now.{" "}
        <span className="font-medium text-foreground">{totalCount}</span> item
        {totalCount === 1 ? "" : "s"}.
      </p>

      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          onObligation={(item) => setFocusObligationId(item.obligation?.id ?? null)}
          onNotifyAttest={(item) => notifyAttest.mutate(item)}
          notifyingKey={notifyingKey}
        />
      ))}

      {focusObligation && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Complete: {focusObligation.title}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFocusObligationId(null)}
            >
              Close
            </Button>
          </div>
          <ObligationCard
            orgId={orgId}
            obligation={focusObligation}
            groupNamesById={groupNamesById}
            userNamesById={userNamesById}
            publishedFormIds={publishedFormIds}
            onEdit={(ob) => {
              setEditing(ob);
              setDrawerOpen(true);
            }}
          />
        </div>
      )}

      <ObligationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        orgId={orgId}
        obligation={editing}
      />
    </div>
  );
}
