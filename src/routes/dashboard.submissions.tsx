import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequireRole } from "@/components/rbac-guard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  User, Clock, ClipboardCheck, FileText, Search, Calendar as CalendarIcon,
  AlertOctagon, Stethoscope, Receipt, Sparkles, MapPin, Download,
} from "lucide-react";
import { jobCodeLabel } from "@/lib/job-codes";
import { decimalHoursBetween } from "@/lib/time-rounding";
import { LiveMap } from "@/components/live-map";

export const Route = createFileRoute("/dashboard/submissions")({
  head: () => ({ meta: [{ title: "Client Submissions — Care Academy" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <SubmissionsPage />
    </RequireRole>
  ),
});

type TimelineKind = "shift" | "daily_log" | "submitted_form";

type TimelineItem = {
  id: string;
  kind: TimelineKind;
  occurred_at: string;
  title: string;
  subtitle: string;
  payload: Record<string, unknown>;
};

function SubmissionsPage() {
  const { data: org } = useCurrentOrg();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // Default date range: last 30 days.
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);
  const [startDate, setStartDate] = useState(monthAgo.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));

  const { data: clients, isLoading: clientsLoading } = useQuery({
    enabled: !!org,
    queryKey: ["submissions-clients", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, job_code, pcsp_goals, home_latitude, home_longitude")
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredClients = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = clients ?? [];
    if (!t) return list;
    return list.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(t));
  }, [clients, q]);

  const selectedClient = useMemo(
    () => (clients ?? []).find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Submissions Hub</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          360° Historical Compliance Ledger — every shift, daily log, and submitted form for each individual.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Client master list */}
        <Card className="h-fit overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Clients</h3>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-xs" />
            </div>
          </div>
          {clientsLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !filteredClients.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No clients found.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {filteredClients.map((c) => {
                const sel = c.id === selectedClientId;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedClientId(c.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                        sel ? "bg-accent" : "hover:bg-accent/50"
                      }`}
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {c.first_name} {c.last_name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {Array.isArray(c.job_code) && c.job_code.length
                            ? c.job_code.join(" · ")
                            : "No billing codes"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Right side: ledger */}
        {!selectedClient ? (
          <Card className="grid place-items-center p-16 text-center text-sm text-muted-foreground">
            Select a client to view their 360° compliance ledger.
          </Card>
        ) : (
          <ClientLedger
            client={selectedClient}
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- LEDGER ----------------------------- */

type Client = {
  id: string; first_name: string; last_name: string; job_code: string[] | null;
  pcsp_goals: string[]; home_latitude: number | null; home_longitude: number | null;
};

function ClientLedger({
  client, startDate, endDate, onStartChange, onEndChange,
}: {
  client: Client; startDate: string; endDate: string;
  onStartChange: (s: string) => void; onEndChange: (s: string) => void;
}) {
  const { data: org } = useCurrentOrg();
  const [openItem, setOpenItem] = useState<TimelineItem | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const startIso = `${startDate}T00:00:00.000Z`;
  const endIso = `${endDate}T23:59:59.999Z`;

  const { data: items, isLoading } = useQuery({
    enabled: !!org && !!client,
    queryKey: ["client-timeline", org?.organization_id, client.id, startIso, endIso],
    queryFn: async (): Promise<TimelineItem[]> => {
      const orgId = org!.organization_id;
      const [shiftsRes, logsRes, formsRes] = await Promise.all([
        supabase
          .from("shifts")
          .select("id, user_id, clock_in_time, clock_out_time, job_code, clock_in_lat, clock_in_long, outside_geofence, clock_in_bypass_reason, profiles:user_id(full_name, email)")
          .eq("organization_id", orgId)
          .eq("client_id", client.id)
          .gte("clock_in_time", startIso)
          .lte("clock_in_time", endIso),
        supabase
          .from("daily_logs")
          .select("id, user_id, log_date, narrative, pcsp_goals_addressed, signature_data_url, status, submitted_at, profiles:user_id(full_name, email)")
          .eq("organization_id", orgId)
          .eq("client_id", client.id)
          .gte("submitted_at", startIso)
          .lte("submitted_at", endIso),
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from("submitted_forms" as any)
          .select("id, user_id, form_type, title, narrative, attachment_url, payload, occurred_at, profiles:user_id(full_name, email)")
          .eq("organization_id", orgId)
          .eq("client_id", client.id)
          .gte("occurred_at", startIso)
          .lte("occurred_at", endIso),
      ]);
      if (shiftsRes.error) throw shiftsRes.error;
      if (logsRes.error) throw logsRes.error;
      if (formsRes.error) throw formsRes.error;

      const out: TimelineItem[] = [];
      (shiftsRes.data ?? []).forEach((s) => {
        const staff = (s.profiles as { full_name?: string; email?: string } | null);
        const staffName = staff?.full_name || staff?.email || "—";
        const hrs = decimalHoursBetween(s.clock_in_time, s.clock_out_time);
        out.push({
          id: `shift-${s.id}`,
          kind: "shift",
          occurred_at: s.clock_in_time ?? new Date().toISOString(),
          title: `${jobCodeLabel(s.job_code).split(" — ")[0]} shift · ${staffName}`,
          subtitle: s.clock_out_time
            ? `${hrs.toFixed(2)} hrs · ${new Date(s.clock_in_time!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${new Date(s.clock_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "In progress",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: { ...(s as any), _staff: staffName },
        });
      });
      (logsRes.data ?? []).forEach((l) => {
        const staff = (l.profiles as { full_name?: string; email?: string } | null);
        const staffName = staff?.full_name || staff?.email || "—";
        out.push({
          id: `log-${l.id}`,
          kind: "daily_log",
          occurred_at: l.submitted_at,
          title: `HHS daily log · ${staffName}`,
          subtitle: `${(l.pcsp_goals_addressed ?? []).length} goals addressed · ${l.status.replace("_", " ")}`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload: { ...(l as any), _staff: staffName },
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((formsRes.data ?? []) as any[]).forEach((f) => {
        const staff = (f.profiles as { full_name?: string; email?: string } | null);
        const staffName = staff?.full_name || staff?.email || "—";
        out.push({
          id: `form-${f.id}`,
          kind: "submitted_form",
          occurred_at: f.occurred_at,
          title: `${formTypeLabel(f.form_type)} · ${f.title}`,
          subtitle: `Submitted by ${staffName}`,
          payload: { ...f, _staff: staffName },
        });
      });
      out.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
      return out;
    },
  });

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <User className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-xl font-semibold">{client.first_name} {client.last_name}</h3>
              <div className="mt-1 flex flex-wrap gap-1">
                {(client.job_code ?? []).map((c) => (
                  <Badge key={c} variant="outline" className="font-mono text-[10px]">{c}</Badge>
                ))}
              </div>
            </div>
          </div>
          <Button onClick={() => setSummaryOpen(true)} variant="default" size="sm">
            <Sparkles className="mr-2 h-3.5 w-3.5" /> Generate Month-End Summary
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
            <Input type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} className="h-9 w-[170px]" />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
            <Input type="date" value={endDate} onChange={(e) => onEndChange(e.target.value)} className="h-9 w-[170px]" />
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarIcon className="h-3.5 w-3.5" />
            {items?.length ?? 0} entries
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Timeline</h3>
        </div>
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading timeline…</p>
        ) : !items?.length ? (
          <p className="p-12 text-center text-sm text-muted-foreground">No activity in this date range.</p>
        ) : (
          <ol className="divide-y divide-border">
            {items.map((it) => (
              <TimelineRow key={it.id} item={it} onOpen={() => setOpenItem(it)} />
            ))}
          </ol>
        )}
      </Card>

      <DetailDrawer item={openItem} client={client} onClose={() => setOpenItem(null)} />
      <MonthlySummaryDialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        client={client}
        items={items ?? []}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}

function formTypeLabel(t: string) {
  if (t === "incident_report") return "🚨 Incident";
  if (t === "medical_summary") return "🩺 Medical";
  if (t === "receipt_upload") return "📸 Receipt";
  return t;
}

function TimelineRow({ item, onOpen }: { item: TimelineItem; onOpen: () => void }) {
  const Icon = item.kind === "shift" ? Clock : item.kind === "daily_log" ? ClipboardCheck : FileText;
  const tone =
    item.kind === "shift"
      ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
      : item.kind === "daily_log"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-accent/50"
      >
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {new Date(item.occurred_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </button>
    </li>
  );
}

function DetailDrawer({ item, client, onClose }: { item: TimelineItem | null; client: Client; onClose: () => void }) {
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>{item.title}</SheetTitle>
              <SheetDescription>
                {new Date(item.occurred_at).toLocaleString()}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 space-y-4">
              {item.kind === "shift" && <ShiftDetails item={item} client={client} />}
              {item.kind === "daily_log" && <DailyLogDetails item={item} />}
              {item.kind === "submitted_form" && <FormDetails item={item} />}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ShiftDetails({ item, client }: { item: TimelineItem; client: Client }) {
  const p = item.payload as {
    clock_in_time: string; clock_out_time: string | null; job_code: string | null;
    clock_in_lat: number | null; clock_in_long: number | null;
    outside_geofence: boolean; clock_in_bypass_reason: string | null;
  };
  return (
    <div className="space-y-3 text-sm">
      <KV k="Billing code" v={jobCodeLabel(p.job_code)} />
      <KV k="Clock-in" v={new Date(p.clock_in_time).toLocaleString()} />
      <KV k="Clock-out" v={p.clock_out_time ? new Date(p.clock_out_time).toLocaleString() : "In progress"} />
      {p.clock_out_time && (
        <KV k="Duration" v={`${decimalHoursBetween(p.clock_in_time, p.clock_out_time).toFixed(2)} hrs`} />
      )}
      {p.outside_geofence && (
        <div className="rounded-lg border border-orange-400/40 bg-orange-50 p-3 text-xs text-orange-900 dark:bg-orange-500/10 dark:text-orange-200">
          <p className="font-medium">Outside geofence — bypass reason</p>
          <p className="mt-1">{p.clock_in_bypass_reason || "—"}</p>
        </div>
      )}
      {p.clock_in_lat != null && p.clock_in_long != null && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-3 w-3" /> GPS verification
          </p>
          <LiveMap
            home={
              client.home_latitude != null && client.home_longitude != null
                ? { lat: Number(client.home_latitude), lng: Number(client.home_longitude) }
                : null
            }
            staff={{ lat: Number(p.clock_in_lat), lng: Number(p.clock_in_long) }}
            height={240}
          />
        </div>
      )}
    </div>
  );
}

function DailyLogDetails({ item }: { item: TimelineItem }) {
  const p = item.payload as {
    narrative: string; pcsp_goals_addressed: string[]; signature_data_url: string | null; status: string;
  };
  return (
    <div className="space-y-3 text-sm">
      <KV k="Status" v={p.status.replace("_", " ")} />
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">PCSP goals addressed</p>
        <div className="flex flex-wrap gap-1">
          {(p.pcsp_goals_addressed ?? []).map((g) => (
            <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Narrative</p>
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed">{p.narrative}</p>
      </div>
      {p.signature_data_url && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Signature</p>
          <img src={p.signature_data_url} alt="Signature" className="rounded-lg border border-border bg-white" />
        </div>
      )}
    </div>
  );
}

function FormDetails({ item }: { item: TimelineItem }) {
  const p = item.payload as {
    form_type: string; title: string; narrative: string; attachment_url: string | null;
    payload: Record<string, unknown>;
  };
  const Icon = p.form_type === "incident_report" ? AlertOctagon : p.form_type === "medical_summary" ? Stethoscope : Receipt;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="font-medium">{formTypeLabel(p.form_type)}</span>
      </div>
      <KV k="Title" v={p.title} />
      {Object.entries(p.payload ?? {}).map(([k, v]) => (
        <KV key={k} k={k} v={String(v)} />
      ))}
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Narrative</p>
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap">{p.narrative}</p>
      </div>
      {p.attachment_url && (
        <a
          href={p.attachment_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Download className="h-3 w-3" /> Open attachment
        </a>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-baseline gap-3">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className="text-sm">{v}</span>
    </div>
  );
}

/* -------------------- MONTHLY SUMMARY GENERATOR -------------------- */

function MonthlySummaryDialog({
  open, onClose, client, items, startDate, endDate,
}: {
  open: boolean; onClose: () => void; client: Client; items: TimelineItem[];
  startDate: string; endDate: string;
}) {
  const summary = useMemo(() => buildMonthlySummary(client, items, startDate, endDate), [client, items, startDate, endDate]);

  function download() {
    const blob = new Blob([summary], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${client.last_name}_${client.first_name}_summary_${startDate}_${endDate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Month-End Progress Summary
          </DialogTitle>
        </DialogHeader>
        <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-xs leading-relaxed">
          {summary}
        </pre>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={download}>
            <Download className="mr-2 h-3.5 w-3.5" /> Download .md
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildMonthlySummary(client: Client, items: TimelineItem[], startDate: string, endDate: string): string {
  const goals = client.pcsp_goals ?? [];
  const shifts = items.filter((i) => i.kind === "shift");
  const logs = items.filter((i) => i.kind === "daily_log");
  const forms = items.filter((i) => i.kind === "submitted_form");

  const totalHours = shifts.reduce((sum, s) => {
    const p = s.payload as { clock_in_time?: string; clock_out_time?: string | null };
    return sum + decimalHoursBetween(p.clock_in_time, p.clock_out_time);
  }, 0);

  // Group log narratives by PCSP goal.
  const byGoal = new Map<string, string[]>();
  for (const g of goals) byGoal.set(g, []);
  byGoal.set("_unaligned", []);
  for (const log of logs) {
    const p = log.payload as { narrative?: string; pcsp_goals_addressed?: string[]; _staff?: string };
    const date = new Date(log.occurred_at).toLocaleDateString();
    const entry = `- **${date}** (${p._staff ?? "—"}): ${p.narrative ?? ""}`;
    const addressed = p.pcsp_goals_addressed ?? [];
    if (!addressed.length) {
      byGoal.get("_unaligned")!.push(entry);
    } else {
      for (const g of addressed) {
        if (!byGoal.has(g)) byGoal.set(g, []);
        byGoal.get(g)!.push(entry);
      }
    }
  }

  const lines: string[] = [];
  lines.push(`# Month-End Progress Summary`);
  lines.push(`**Client:** ${client.first_name} ${client.last_name}`);
  lines.push(`**Period:** ${startDate} → ${endDate}`);
  lines.push("");
  lines.push(`## Service Delivery`);
  lines.push(`- Total shifts: **${shifts.length}**`);
  lines.push(`- Total billable hours (quarter-hour rounded): **${totalHours.toFixed(2)} hrs**`);
  lines.push(`- Daily HHS journals submitted: **${logs.length}**`);
  lines.push(`- Submitted forms (incidents/medical/receipts): **${forms.length}**`);
  lines.push("");
  lines.push(`## PCSP Goal Progress`);
  if (!goals.length) {
    lines.push(`_No active PCSP goals on file._`);
  } else {
    for (const g of goals) {
      const entries = byGoal.get(g) ?? [];
      lines.push("");
      lines.push(`### ${g}`);
      lines.push(entries.length ? entries.join("\n") : `_No documented progress this period._`);
    }
  }
  const unaligned = byGoal.get("_unaligned") ?? [];
  if (unaligned.length) {
    lines.push("");
    lines.push(`### Other narratives (no goals tagged)`);
    lines.push(unaligned.join("\n"));
  }
  if (forms.length) {
    lines.push("");
    lines.push(`## Reported Events`);
    for (const f of forms) {
      const p = f.payload as { form_type?: string; title?: string; narrative?: string; _staff?: string };
      const date = new Date(f.occurred_at).toLocaleDateString();
      lines.push(`- **${date}** — ${formTypeLabel(p.form_type ?? "")} — _${p.title}_ (by ${p._staff})`);
    }
  }
  return lines.join("\n");
}
