import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Bell, AlertTriangle, Clock, CheckCircle2, X, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getOrgCeRoster } from "@/lib/ce.functions";

type Urgency = "normal" | "urgent" | "critical";
type NotificationType =
  | "incident_report_filed"
  | "incident_deadline_warning"
  | "timesheet_exception"
  | "daily_log_exception"
  | "open_shift_warning"
  | "medication_error";

type AppNotification = {
  id: string; organization_id: string; type: NotificationType;
  urgency: Urgency; title: string; body: string;
  link_to: string | null; related_id: string | null;
  related_type: string | null; read_at: string | null;
  dismissed_at: string | null; created_at: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function urgencyRing(urgency: Urgency) {
  if (urgency === "critical") return "border-l-4 border-l-rose-500 bg-rose-50 dark:bg-rose-950/40";
  if (urgency === "urgent") return "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/40";
  return "border-l-4 border-l-blue-400 bg-blue-50 dark:bg-blue-950/30";
}

function urgencyIcon(urgency: Urgency) {
  if (urgency === "critical") return <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />;
  if (urgency === "urgent") return <Clock className="h-4 w-4 shrink-0 text-amber-500" />;
  return <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-400" />;
}

function badgeColor(urgency: Urgency) {
  if (urgency === "critical") return "bg-rose-500 text-white";
  if (urgency === "urgent") return "bg-amber-500 text-white";
  return "bg-blue-500 text-white";
}

export function NotificationBell() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const { data: notifications = [] } = useQuery({
    enabled: !!user?.id && !!org?.organization_id,
    queryKey: ["notifications", org?.organization_id],
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from("notifications").select("*")
        .eq("organization_id", org!.organization_id)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!org?.organization_id) return;
    const channel = supabase
      .channel(`notifications:${org.organization_id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `organization_id=eq.${org.organization_id}`,
      }, () => qc.invalidateQueries({ queryKey: ["notifications", org.organization_id] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [org?.organization_id, qc]);

  const markReadMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications")
        .update({ read_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", org?.organization_id] }),
  });

  const dismissMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications")
        .update({ dismissed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", org?.organization_id] }),
  });

  const markAllReadMut = useMutation({
    mutationFn: async () => {
      const ids = notifications.filter((n) => !n.read_at).map((n) => n.id);
      if (!ids.length) return;
      const { error } = await supabase.from("notifications")
        .update({ read_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", org?.organization_id] }),
  });

  // CE roster signal — surfaces "N staff behind on CE" as a synthetic top entry.
  const fetchRoster = useServerFn(getOrgCeRoster);
  const { data: ceRoster } = useQuery({
    enabled: !!user?.id && !!org?.organization_id,
    queryKey: ["ce-roster-signal", org?.organization_id],
    queryFn: () => fetchRoster(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const ceBehind = ceRoster?.behindCount ?? 0;
  const ceSynthetic = useMemo<AppNotification | null>(() => {
    if (ceBehind <= 0) return null;
    return {
      id: "__ce_behind__",
      organization_id: org?.organization_id ?? "",
      type: "incident_deadline_warning",
      urgency: "urgent",
      title: `${ceBehind} staff behind on Continuing Education`,
      body: "DSPD requires 12 CE hours per staff per year (Year 2+). Open CE Hours to see who's behind.",
      link_to: "/dashboard/admin/ce-hours",
      related_id: null,
      related_type: null,
      read_at: null,
      dismissed_at: null,
      created_at: new Date().toISOString(),
    };
  }, [ceBehind, org?.organization_id]);

  const merged = useMemo(
    () => (ceSynthetic ? [ceSynthetic, ...notifications] : notifications),
    [ceSynthetic, notifications],
  );

  const unread = merged.filter((n) => !n.read_at);
  const critical = unread.filter((n) => n.urgency === "critical");
  const unreadCount = unread.length;

  function handleClick(n: AppNotification) {
    if (n.id !== "__ce_synthetic__" && n.id !== "__ce_behind__" && !n.read_at) markReadMut.mutate(n.id);
    if (n.link_to) { setOpen(false); navigate({ to: n.link_to as never }); }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef} type="button"
        onClick={() => { setOpen((o) => !o); if (!open && unreadCount > 0) markAllReadMut.mutate(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ""}`}
      >
        <Bell className={`h-5 w-5 ${critical.length > 0 ? "text-rose-500" : ""}`} />
        {unreadCount > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${critical.length > 0 ? "bg-rose-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {critical.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-ping rounded-full bg-rose-400 opacity-60" />
        )}
      </button>

      {open && (
        <div ref={panelRef} className="absolute right-0 top-11 z-50 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <Badge className={`text-[10px] px-1.5 py-0 ${badgeColor(critical.length > 0 ? "critical" : "normal")}`}>
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {merged.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Bell className="h-8 w-8 opacity-20" />
                <p>No notifications</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {merged.map((n) => {
                  const synthetic = n.id.startsWith("__");
                  return (
                  <li key={n.id} className={`group ${!n.read_at ? "bg-muted/30" : ""}`}>
                    <div className={`${urgencyRing(n.urgency)} relative`}>
                      <button type="button" onClick={() => handleClick(n)}
                        className="w-full px-4 py-3 text-left transition hover:bg-accent/50">
                        <div className="flex items-start gap-2.5">
                          {synthetic ? <GraduationCap className="h-4 w-4 shrink-0 text-amber-500" /> : urgencyIcon(n.urgency)}
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-semibold leading-snug ${!n.read_at ? "text-foreground" : "text-muted-foreground"}`}>
                              {n.title}
                            </p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{n.body}</p>
                            {!synthetic && <p className="mt-1 text-[10px] text-muted-foreground/70">{timeAgo(n.created_at)}</p>}
                          </div>
                          {!n.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        </div>
                      </button>
                      {!synthetic && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); dismissMut.mutate(n.id); }}
                          className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground/50 opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
                          aria-label="Dismiss">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          {merged.length > 0 && (
            <div className="border-t border-border px-4 py-2.5">
              <Button variant="ghost" size="sm"
                className="h-7 w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setOpen(false); navigate({ to: "/dashboard/command-center" as never }); }}>
                View Agency Command Center →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
