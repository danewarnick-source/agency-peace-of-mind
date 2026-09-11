import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  adviseMoveToClientThread,
  createTeamThread,
  listMyThreads,
  listThreadMessages,
  replyOnThread,
  type ThreadListItem,
} from "@/lib/threads.functions";
import { TEAM_DAY_SUPPORT_SUBJECT } from "@/lib/threads";
import { supabase } from "@/integrations/supabase/client";

export function ThreadsPanel({
  variant = "admin",
}: {
  variant?: "admin" | "staff";
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const qc = useQueryClient();
  const listFn = useServerFn(listMyThreads);
  const msgsFn = useServerFn(listThreadMessages);
  const replyFn = useServerFn(replyOnThread);
  const teamFn = useServerFn(createTeamThread);
  const adviseFn = useServerFn(adviseMoveToClientThread);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teamBody, setTeamBody] = useState("");

  const listQ = useQuery({
    queryKey: ["threads", orgId],
    enabled: !!orgId,
    queryFn: () => listFn({ data: { organizationId: orgId as string } }),
  });

  const teamsQ = useQuery({
    queryKey: ["threads-teams", orgId],
    enabled: !!orgId && variant === "admin",
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("teams")
        .select("id, team_name")
        .eq("organization_id", orgId)
        .eq("active", true)
        .order("team_name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; team_name: string }>;
    },
  });

  const msgsQ = useQuery({
    queryKey: ["thread-messages", orgId, activeId],
    enabled: !!orgId && !!activeId,
    queryFn: () =>
      msgsFn({
        data: { organizationId: orgId as string, threadId: activeId as string },
      }),
  });

  const replyM = useMutation({
    mutationFn: () =>
      replyFn({
        data: {
          organizationId: orgId as string,
          threadId: activeId as string,
          body: reply,
        },
      }),
    onSuccess: (res) => {
      if (!res.softReady) {
        toast.message("Threads are pending Soft Core.");
        return;
      }
      setReply("");
      void qc.invalidateQueries({ queryKey: ["thread-messages", orgId, activeId] });
      void qc.invalidateQueries({ queryKey: ["threads", orgId] });
      toast.success("Reply saved to the thread and the timesheet manager note.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Reply failed."),
  });

  const teamM = useMutation({
    mutationFn: () =>
      teamFn({
        data: {
          organizationId: orgId as string,
          teamId,
          subject: TEAM_DAY_SUPPORT_SUBJECT,
          body: teamBody,
        },
      }),
    onSuccess: (res) => {
      if (!res.softReady) {
        toast.message("Threads are pending Soft Core.");
        return;
      }
      setTeamBody("");
      void qc.invalidateQueries({ queryKey: ["threads", orgId] });
      toast.success("Day support team thread created.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Team thread failed."),
  });

  const adviseM = useMutation({
    mutationFn: (threadId: string) =>
      adviseFn({ data: { organizationId: orgId as string, threadId } }),
    onSuccess: (res) => {
      toast.message(res.message);
    },
  });

  if (!orgId) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Select a workspace to open threads.
      </div>
    );
  }

  const rows = listQ.data?.rows ?? [];
  const active = rows.find((r) => r.id === activeId) ?? null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Threads</h2>
        {listQ.data && !listQ.data.softReady ? (
          <span className="text-[11px] text-amber-800">Pending Soft Core</span>
        ) : null}
      </div>

      {variant === "admin" ? (
        <div className="grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_2fr_auto]">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            <option value="">Select a team</option>
            {(teamsQ.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.team_name}</option>
            ))}
          </select>
          <Textarea
            rows={2}
            placeholder="Day support note"
            value={teamBody}
            onChange={(e) => setTeamBody(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={teamM.isPending || teamId.length < 8 || teamBody.trim().length === 0}
            onClick={() => teamM.mutate()}
          >
            {teamM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Day support"}
          </Button>
        </div>
      ) : null}

      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading threads…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No threads yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <ThreadRowButton
              key={row.id}
              row={row}
              active={row.id === activeId}
              onOpen={() => setActiveId(row.id)}
            />
          ))}
        </ul>
      )}

      {active ? (
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{active.subject}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => adviseM.mutate(active.id)}
            >
              Move to client thread
            </Button>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto text-sm">
            {(msgsQ.data?.rows ?? []).map((m) => (
              <div key={m.id} className="rounded-md bg-muted/40 px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.kind}
                </div>
                <p>{m.body}</p>
              </div>
            ))}
          </div>
          <Textarea
            rows={2}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Quick reply"
          />
          <Button
            type="button"
            size="sm"
            disabled={replyM.isPending || reply.trim().length === 0}
            onClick={() => replyM.mutate()}
          >
            {replyM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Quick reply"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ThreadRowButton({
  row,
  active,
  onOpen,
}: {
  row: ThreadListItem;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full items-start justify-between gap-3 px-1 py-2 text-left text-sm ${
          active ? "bg-accent/50" : ""
        }`}
      >
        <span>
          <span className="font-medium">{row.subject}</span>
          {row.last_body ? (
            <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-1">
              {row.last_body}
            </span>
          ) : null}
        </span>
        {row.unread_for_me ? (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
            Needs reply
          </span>
        ) : null}
      </button>
    </li>
  );
}
