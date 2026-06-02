import { useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { askNectarHelp, type NectarHelpReply } from "@/lib/nectar-help.functions";
import { NectarInfusionLock } from "@/components/nectar/nectar-infusion-lock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FolderArchive,
  FileText,
  Search,
  Upload,
  CheckCircle2,
  Send,
  Loader2,
  Download,
  Trash2,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, subMonths } from "date-fns";

// ---------- Top: Document & report pull ----------

type PulledRow = {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  date?: string | null;
  client_id?: string | null;
  staff_id?: string | null;
};

type RecordTypeKey =
  | "evv"
  | "billing_520"
  | "client_doc"
  | "incident"
  | "client_spending"
  | "activity_reimbursement"
  | "pcsp"
  | "budget_1056"
  | "intake_referral"
  | "certification"
  | "training"
  | "mar"
  | "nectar_doc";

const RECORD_TYPES: { key: RecordTypeKey; label: string; group: string }[] = [
  { key: "evv", label: "EVV timesheets", group: "Service delivery" },
  { key: "billing_520", label: "520 billing submissions", group: "Billing" },
  { key: "client_spending", label: "Client spending logs", group: "Billing" },
  { key: "activity_reimbursement", label: "Activity reimbursements", group: "Billing" },
  { key: "pcsp", label: "PCSP plans", group: "Client documents" },
  { key: "budget_1056", label: "1056 budgets", group: "Client documents" },
  { key: "intake_referral", label: "Intake & referrals", group: "Client documents" },
  { key: "client_doc", label: "Client documents (other)", group: "Client documents" },
  { key: "mar", label: "MAR / eMAR records", group: "Clinical" },
  { key: "incident", label: "Incident reports", group: "Clinical" },
  { key: "certification", label: "Staff certifications", group: "Workforce" },
  { key: "training", label: "Training records", group: "Workforce" },
  { key: "nectar_doc", label: "NECTAR document library", group: "Other" },
];

// Each record type maps to a Supabase pull. Types without an implemented
// source resolve to an empty list with a friendly note — the dropdown still
// exposes them so the catalog is complete, and NECTAR's document library
// captures uploaded copies in the meantime.
async function pullByType(args: {
  orgId: string;
  type: RecordTypeKey;
  fromTs: string | null;
  toTs: string | null;
  fromDate: string | null;
  toDate: string | null;
  clientId: string | null;
  staffId: string | null;
}): Promise<PulledRow[]> {
  const { orgId, type, fromTs, toTs, fromDate, toDate, clientId, staffId } = args;

  switch (type) {
    case "evv": {
      let q = supabase
        .from("evv_timesheets")
        .select("id, clock_in_timestamp, client_id, staff_id, service_type_code")
        .eq("organization_id", orgId)
        .order("clock_in_timestamp", { ascending: false })
        .limit(200);
      if (fromTs) q = q.gte("clock_in_timestamp", fromTs);
      if (toTs) q = q.lte("clock_in_timestamp", toTs);
      if (clientId) q = q.eq("client_id", clientId);
      if (staffId) q = q.eq("staff_id", staffId);
      const { data } = await q;
      return (data ?? []).map((t: any) => ({
        id: `evv:${t.id}`,
        type: "EVV Timesheet",
        title: `Timesheet ${format(new Date(t.clock_in_timestamp), "MMM d, yyyy p")}`,
        subtitle: t.service_type_code ?? null,
        date: t.clock_in_timestamp,
        client_id: t.client_id,
        staff_id: t.staff_id,
      }));
    }
    case "billing_520": {
      let q = supabase
        .from("billing_submissions")
        .select("id, period_start, period_end, status")
        .eq("organization_id", orgId)
        .order("period_start", { ascending: false })
        .limit(200);
      if (fromDate) q = q.gte("period_start", fromDate);
      if (toDate) q = q.lte("period_start", toDate);
      const { data } = await q;
      return (data ?? []).map((s: any) => ({
        id: `billing:${s.id}`,
        type: "520 Submission",
        title: `520 — ${format(new Date(s.period_start), "MMMM yyyy")}`,
        subtitle: s.status,
        date: s.period_start,
      }));
    }
    case "client_doc":
    case "pcsp":
    case "budget_1056":
    case "intake_referral": {
      const categoryFilter: Record<string, string | null> = {
        pcsp: "pcsp",
        budget_1056: "1056",
        intake_referral: "intake",
        client_doc: null,
      };
      let q = supabase
        .from("client_documents")
        .select("id, title, created_at, client_id, category")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (fromTs) q = q.gte("created_at", fromTs);
      if (toTs) q = q.lte("created_at", toTs);
      if (clientId) q = q.eq("client_id", clientId);
      const cat = categoryFilter[type];
      if (cat) q = q.ilike("category", `%${cat}%`);
      const { data } = await q;
      const label = RECORD_TYPES.find((r) => r.key === type)?.label ?? "Client document";
      return (data ?? []).map((d: any) => ({
        id: `client_doc:${d.id}`,
        type: label,
        title: d.title ?? "Untitled",
        subtitle: d.category ?? null,
        date: d.created_at,
        client_id: d.client_id,
      }));
    }
    case "incident": {
      let q = supabase
        .from("incident_reports")
        .select("id, summary, submitted_at, client_id")
        .eq("organization_id", orgId)
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (fromTs) q = q.gte("submitted_at", fromTs);
      if (toTs) q = q.lte("submitted_at", toTs);
      if (clientId) q = q.eq("client_id", clientId);
      const { data } = await q;
      return (data ?? []).map((r: any) => ({
        id: `incident:${r.id}`,
        type: "Incident Report",
        title: r.summary ?? "Incident report",
        date: r.submitted_at,
        client_id: r.client_id,
      }));
    }
    case "client_spending": {
      let q = supabase
        .from("client_spending_log")
        .select("id, amount, purpose, spent_at, client_id, staff_id, shift_id")
        .eq("organization_id", orgId)
        .order("spent_at", { ascending: false })
        .limit(200);
      if (fromTs) q = q.gte("spent_at", fromTs);
      if (toTs) q = q.lte("spent_at", toTs);
      if (clientId) q = q.eq("client_id", clientId);
      if (staffId) q = q.eq("staff_id", staffId);
      const { data } = await q;
      return (data ?? []).map((r: any) => ({
        id: `client_spending:${r.id}`,
        type: "Client Spending",
        title: `$${Number(r.amount).toFixed(2)} — ${r.purpose}`,
        subtitle: r.shift_id ? `Shift ${String(r.shift_id).slice(0, 8)}` : null,
        date: r.spent_at,
        client_id: r.client_id,
        staff_id: r.staff_id,
      }));
    }
    case "nectar_doc": {
      let q = supabase
        .from("nectar_documents")
        .select("id, title, doc_type, created_at, client_id, staff_id")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (fromTs) q = q.gte("created_at", fromTs);
      if (toTs) q = q.lte("created_at", toTs);
      if (clientId) q = q.eq("client_id", clientId);
      if (staffId) q = q.eq("staff_id", staffId);
      const { data, error } = await q;
      if (error) return [];
      return (data ?? []).map((d: any) => ({
        id: `nectar_doc:${d.id}`,
        type: "NECTAR Document",
        title: d.title ?? d.doc_type ?? "Document",
        subtitle: d.doc_type ?? null,
        date: d.created_at,
        client_id: d.client_id,
        staff_id: d.staff_id,
      }));
    }
    case "activity_reimbursement":
    case "certification":
    case "training":
    case "mar":
    default:
      // Catalog entry is exposed in the dropdown so the user can request
      // these record types; backend wiring lands in their respective
      // foundation prompts. Return empty for now.
      return [];
  }
}

function DocumentPull({ orgId }: { orgId?: string }) {
  const [type, setType] = useState<RecordTypeKey | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [pullKey, setPullKey] = useState(0);

  // NECTAR Infusion: plain-language pull
  const [nectarPrompt, setNectarPrompt] = useState("");
  const [nectarReply, setNectarReply] = useState<NectarHelpReply | null>(null);
  const ask = useServerFn(askNectarHelp);
  const askMutation = useMutation({
    mutationFn: async (q: string) => ask({ data: { question: q, role: "admin" } }),
    onSuccess: (r: NectarHelpReply) => setNectarReply(r),
    onError: (e: any) => toast.error(e?.message ?? "NECTAR couldn't answer that."),
  });

  const { data: clients } = useQuery({
    enabled: !!orgId,
    queryKey: ["audit-pull-clients", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId!)
        .order("last_name", { ascending: true })
        .limit(500);
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>;
    },
  });

  const { data: staff } = useQuery({
    enabled: !!orgId,
    queryKey: ["audit-pull-staff", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("user_id, profiles(id, full_name, email)")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .limit(500);
      const out = (data ?? []).map((m: any) => ({
        id: m.user_id as string,
        name: (m.profiles?.full_name as string) || (m.profiles?.email as string) || "Staff",
      }));
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data, isLoading, isFetching } = useQuery({
    enabled: !!orgId && pullKey > 0,
    queryKey: ["audit-pull", orgId, pullKey],
    queryFn: async () => {
      const fromTs = from ? new Date(from).toISOString() : null;
      const toTs = to ? new Date(to + "T23:59:59").toISOString() : null;
      const typesToPull: RecordTypeKey[] = type
        ? [type]
        : (RECORD_TYPES.map((r) => r.key) as RecordTypeKey[]);

      const all: PulledRow[] = [];
      for (const t of typesToPull) {
        const rows = await pullByType({
          orgId: orgId!,
          type: t,
          fromTs,
          toTs,
          fromDate: from || null,
          toDate: to || null,
          clientId: clientId || null,
          staffId: staffId || null,
        });
        all.push(...rows);
      }
      return all.sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : 0));
    },
  });

  const canPull = !!orgId;
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof RECORD_TYPES>();
    for (const r of RECORD_TYPES) {
      const arr = groups.get(r.group) ?? [];
      arr.push(r);
      groups.set(r.group, arr);
    }
    return Array.from(groups.entries());
  }, []);

  return (
    <Card className="bg-card/60 backdrop-blur border-[color:var(--border-light)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4 text-[color:var(--amber-600)]" />
          Pull a document or report
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Choose a record type and date range, optionally narrow by client or
          staff, then pull. Nothing loads until you do — keeps the audit trail
          deliberate.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* NECTAR Infusion search bar — visible-but-locked for tiers without it */}
        <NectarInfusionLock
          featureName="Pull records in plain language"
          benefit="Ask NECTAR to assemble any pull from your data — e.g. “all of Blake's DSI timesheets for FY26” — instead of building filters by hand. Works across every record type and every plan year on file."
        >
          <div className="rounded-lg border border-[color:var(--amber-300)] bg-gradient-to-br from-[color:var(--amber-50)]/70 to-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-flex h-6 w-6 items-center justify-center text-[color:var(--amber-600)]"
                style={{
                  clipPath:
                    "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
                  background: "linear-gradient(135deg, var(--amber-100), var(--amber-200))",
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <Label className="text-xs font-semibold uppercase tracking-wide text-[color:var(--amber-700)]">
                NECTAR Infusion
              </Label>
              <span className="text-xs text-muted-foreground">
                Ask in plain language
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                value={nectarPrompt}
                onChange={(e) => setNectarPrompt(e.target.value)}
                placeholder="e.g. Pull all of Blake's DSI timesheets for FY26"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nectarPrompt.trim().length > 1) {
                    askMutation.mutate(nectarPrompt.trim());
                  }
                }}
              />
              <Button
                variant="cta"
                onClick={() => askMutation.mutate(nectarPrompt.trim())}
                disabled={askMutation.isPending || nectarPrompt.trim().length < 2}
              >
                {askMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Ask NECTAR
              </Button>
            </div>
            {nectarReply && (
              <div className="mt-3 rounded-md border border-[color:var(--amber-200)] bg-white/80 p-3 text-sm">
                <NectarAnswer text={nectarReply.answer} />
                {nectarReply.deepLink && (
                  <a
                    href={nectarReply.deepLink.path}
                    className="mt-2 inline-block text-xs font-medium text-[color:var(--amber-700)] hover:underline"
                  >
                    {nectarReply.deepLink.label} →
                  </a>
                )}
              </div>
            )}
          </div>
        </NectarInfusionLock>

        {/* Manual pull — always available */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <Label className="text-xs">Record type</Label>
            <Select value={type || "__any"} onValueChange={(v) => setType(v === "__any" ? "" : (v as RecordTypeKey))}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a record type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any">Any record type</SelectItem>
                {grouped.map(([group, items]) => (
                  <div key={group}>
                    <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </div>
                    {items.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-4">
            <Label className="text-xs">Filter by client</Label>
            <Select value={clientId || "__any"} onValueChange={(v) => setClientId(v === "__any" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Any client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any">Any client</SelectItem>
                {(clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.last_name}, {c.first_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Select a client to pull all of their records.
            </p>
          </div>
          <div className="md:col-span-4">
            <Label className="text-xs">Filter by staff</Label>
            <Select value={staffId || "__any"} onValueChange={(v) => setStaffId(v === "__any" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Any staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any">Any staff</SelectItem>
                {(staff ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Select a staff member to pull everything they touched.
            </p>
          </div>

          <div className="md:col-span-3">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end md:col-span-6">
            <Button
              className="w-full md:w-auto"
              variant="cta"
              onClick={() => setPullKey((k) => k + 1)}
              disabled={!canPull}
            >
              <Search className="h-4 w-4" />
              Pull records
            </Button>
          </div>
        </div>

        <div className="divide-y rounded-md border border-[color:var(--border-light)]">
          {pullKey === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Choose your criteria above and press <span className="font-medium text-foreground">Pull records</span>.
              Results stay empty until you do.
            </div>
          )}
          {pullKey > 0 && (isLoading || isFetching) && (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Pulling records…
            </div>
          )}
          {pullKey > 0 && !isLoading && !isFetching && (data ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No records match those filters.
            </div>
          )}
          {(data ?? []).slice(0, 200).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{r.title}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {r.type}
                  {r.subtitle ? ` · ${r.subtitle}` : ""}
                  {r.date ? ` · ${format(new Date(r.date), "MMM d, yyyy")}` : ""}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {r.type.split(" ")[0]}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Bottom: Monthly Billing Support Documents ----------

type AuditFile = {
  id: string;
  organization_id: string;
  period_month: string;
  status: "building" | "review_complete" | "sent_to_audit";
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_to_audit_at: string | null;
  created_at: string;
};

type AuditDoc = {
  id: string;
  audit_file_id: string;
  source: "auto" | "upload";
  category: string | null;
  title: string;
  storage_path: string | null;
  external_ref: string | null;
  created_at: string;
};

const statusMeta: Record<AuditFile["status"], { label: string; cls: string }> = {
  building: { label: "Building", cls: "bg-[color:var(--surface-2)] text-foreground" },
  review_complete: { label: "Review Complete", cls: "bg-[color:var(--amber-100)] text-[color:var(--navy-900)]" },
  sent_to_audit: { label: "Sent to Audit", cls: "bg-[color:var(--navy-900)] text-white" },
};

function MonthlyAuditFolders({ orgId }: { orgId?: string }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const months = useMemo(() => {
    const out: Date[] = [];
    const start = startOfMonth(new Date());
    for (let i = 0; i < 12; i++) out.push(subMonths(start, i));
    return out;
  }, []);

  const { data: files } = useQuery({
    enabled: !!orgId,
    queryKey: ["audit-files", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_files")
        .select("*")
        .eq("organization_id", orgId!)
        .order("period_month", { ascending: false });
      return (data ?? []) as AuditFile[];
    },
  });

  const ensureFile = useMutation({
    mutationFn: async (periodMonth: Date) => {
      const period = format(periodMonth, "yyyy-MM-01");
      const existing = (files ?? []).find((f) => f.period_month === period);
      if (existing) return existing;
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("audit_files")
        .insert({ organization_id: orgId!, period_month: period, created_by: user.user?.id })
        .select("*")
        .single();
      if (error) throw error;
      return data as AuditFile;
    },
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: ["audit-files", orgId] });
      setOpenId(file.id);
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't open audit folder"),
  });

  return (
    <Card className="bg-card/60 backdrop-blur border-[color:var(--border-light)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderArchive className="h-4 w-4 text-[color:var(--amber-600)]" />
          Monthly Billing Support Documents
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Audit-ready folders auto-organized by month. Open one to build the file, then send it to the Audit tab.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {months.map((m) => {
            const period = format(m, "yyyy-MM-01");
            const file = (files ?? []).find((f) => f.period_month === period);
            const meta = file ? statusMeta[file.status] : statusMeta.building;
            return (
              <button
                key={period}
                onClick={() => (file ? setOpenId(file.id) : ensureFile.mutate(m))}
                className="text-left rounded-lg border border-[color:var(--border-light)] bg-white/70 backdrop-blur p-4 hover:border-[color:var(--navy-700)] hover:bg-white transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <FolderArchive className="h-5 w-5 text-[color:var(--navy-700)]" />
                  <Badge className={meta.cls + " border-0"}>{meta.label}</Badge>
                </div>
                <div className="mt-3 font-semibold text-sm">{format(m, "MMMM yyyy")}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {file ? "Open audit folder" : "Start building"}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>

      {openId && (
        <AuditFileDialog
          fileId={openId}
          orgId={orgId!}
          onClose={() => {
            setOpenId(null);
            qc.invalidateQueries({ queryKey: ["audit-files", orgId] });
          }}
        />
      )}
    </Card>
  );
}

function AuditFileDialog({
  fileId,
  orgId,
  onClose,
}: {
  fileId: string;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: file } = useQuery({
    queryKey: ["audit-file", fileId],
    queryFn: async () => {
      const { data } = await supabase.from("audit_files").select("*").eq("id", fileId).single();
      return data as AuditFile;
    },
  });

  const { data: docs } = useQuery({
    enabled: !!file,
    queryKey: ["audit-docs", fileId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_file_documents")
        .select("*")
        .eq("audit_file_id", fileId)
        .order("created_at", { ascending: true });
      return (data ?? []) as AuditDoc[];
    },
  });

  // Auto-pull suggested supporting docs the first time the folder is opened
  const autoPull = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const periodStart = file.period_month;
      const next = new Date(periodStart);
      next.setMonth(next.getMonth() + 1);
      const periodEnd = format(next, "yyyy-MM-dd");

      // Find typical audit artifacts for the month
      const [ts, bs, ir, cs] = await Promise.all([
        supabase
          .from("evv_timesheets")
          .select("id, clock_in_timestamp")
          .eq("organization_id", orgId)
          .gte("clock_in_timestamp", periodStart)
          .lt("clock_in_timestamp", periodEnd)
          .limit(200),
        supabase
          .from("billing_submissions")
          .select("id, period_start")
          .eq("organization_id", orgId)
          .eq("period_start", periodStart)
          .limit(10),
        supabase
          .from("incident_reports")
          .select("id, submitted_at, summary")
          .eq("organization_id", orgId)
          .gte("submitted_at", periodStart)
          .lt("submitted_at", periodEnd)
          .limit(50),
        supabase
          .from("client_spending_log")
          .select("id, amount, spent_at")
          .eq("organization_id", orgId)
          .gte("spent_at", periodStart)
          .lt("spent_at", periodEnd)
          .limit(500),
      ]);

      const rows: Array<Omit<AuditDoc, "id" | "created_at">> = [];
      (bs.data ?? []).forEach((b: any) =>
        rows.push({
          audit_file_id: fileId,
          source: "auto",
          category: "billing",
          title: `520 Submission — ${format(new Date(b.period_start), "MMMM yyyy")}`,
          storage_path: null,
          external_ref: `billing_submissions:${b.id}`,
        }),
      );
      if ((ts.data ?? []).length > 0) {
        rows.push({
          audit_file_id: fileId,
          source: "auto",
          category: "evv",
          title: `EVV Timesheets — ${ts.data!.length} entries for ${format(new Date(periodStart), "MMMM yyyy")}`,
          storage_path: null,
          external_ref: `evv_timesheets:month:${periodStart}`,
        });
      }
      (ir.data ?? []).forEach((r: any) =>
        rows.push({
          audit_file_id: fileId,
          source: "auto",
          category: "incident",
          title: `Incident — ${r.summary ?? "report"} (${format(new Date(r.submitted_at), "MMM d")})`,
          storage_path: null,
          external_ref: `incident_reports:${r.id}`,
        }),
      );
      if ((cs.data ?? []).length > 0) {
        const total = (cs.data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
        rows.push({
          audit_file_id: fileId,
          source: "auto",
          category: "billing",
          title: `Client Spending Log — ${cs.data!.length} entries · $${total.toFixed(2)} for ${format(new Date(periodStart), "MMMM yyyy")}`,
          storage_path: null,
          external_ref: `client_spending_log:month:${periodStart}`,
        });
      }

      // Insert only those that aren't already present (by external_ref)
      const existingRefs = new Set((docs ?? []).map((d) => d.external_ref));
      const toInsert = rows
        .filter((r) => r.external_ref && !existingRefs.has(r.external_ref))
        .map((r) => ({ ...r, organization_id: orgId }));
      if (toInsert.length === 0) return 0;
      const { error } = await supabase.from("audit_file_documents").insert(toInsert);
      if (error) throw error;
      return toInsert.length;
    },
    onSuccess: (n) => {
      if (n) toast.success(`Auto-pulled ${n} document${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["audit-docs", fileId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Auto-pull failed"),
  });

  const upload = useMutation({
    mutationFn: async (f: File) => {
      const path = `${orgId}/${fileId}/${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage
        .from("audit-documents")
        .upload(path, f, { contentType: f.type });
      if (upErr) throw upErr;
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("audit_file_documents").insert({
        audit_file_id: fileId,
        organization_id: orgId,
        source: "upload",
        category: "other",
        title: f.name,
        storage_path: path,
        mime_type: f.type,
        size_bytes: f.size,
        added_by: user.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document added to audit file");
      qc.invalidateQueries({ queryKey: ["audit-docs", fileId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Upload failed"),
  });

  const removeDoc = useMutation({
    mutationFn: async (doc: AuditDoc) => {
      if (doc.storage_path) {
        await supabase.storage.from("audit-documents").remove([doc.storage_path]);
      }
      const { error } = await supabase.from("audit_file_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit-docs", fileId] }),
    onError: (e: any) => toast.error(e.message ?? "Couldn't remove"),
  });

  const download = async (doc: AuditDoc) => {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage
      .from("audit-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Couldn't open file");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const advance = useMutation({
    mutationFn: async (target: "review_complete" | "sent_to_audit") => {
      const { data: user } = await supabase.auth.getUser();
      const patch: any = { status: target };
      if (target === "review_complete") {
        patch.reviewed_by = user.user?.id;
        patch.reviewed_at = new Date().toISOString();
      } else {
        patch.sent_to_audit_at = new Date().toISOString();
      }
      const { error } = await supabase.from("audit_files").update(patch).eq("id", fileId);
      if (error) throw error;
    },
    onSuccess: (_d, target) => {
      toast.success(
        target === "review_complete" ? "Marked Review Complete" : "Sent to Audit tab",
      );
      qc.invalidateQueries({ queryKey: ["audit-file", fileId] });
      qc.invalidateQueries({ queryKey: ["audit-files", orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't update status"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderArchive className="h-5 w-5 text-[color:var(--amber-600)]" />
            {file ? `Audit folder — ${format(new Date(file.period_month), "MMMM yyyy")}` : "Audit folder"}
          </DialogTitle>
        </DialogHeader>

        {file && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Badge className={statusMeta[file.status].cls + " border-0"}>{statusMeta[file.status].label}</Badge>
              <div className="text-xs text-muted-foreground">
                {file.reviewed_at && (
                  <>Reviewed {format(new Date(file.reviewed_at), "MMM d, yyyy p")}</>
                )}
                {file.sent_to_audit_at && (
                  <> · Sent {format(new Date(file.sent_to_audit_at), "MMM d, yyyy p")}</>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => autoPull.mutate()}
                disabled={autoPull.isPending || file.status !== "building"}
              >
                <Sparkles className="h-4 w-4" /> Auto-pull supporting docs
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={upload.isPending || file.status !== "building"}
              >
                <Upload className="h-4 w-4" /> Upload document
              </Button>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="rounded-md border border-[color:var(--border-light)] divide-y max-h-72 overflow-y-auto">
              {(docs ?? []).length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Empty folder. Auto-pull or upload to start.
                </div>
              )}
              {(docs ?? []).map((d) => (
                <div key={d.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">{d.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {d.source === "auto" ? "Auto-pulled" : "Uploaded"} · {d.category ?? "doc"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.storage_path && (
                      <Button size="icon" variant="ghost" onClick={() => download(d)} aria-label="Download">
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {file.status === "building" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeDoc.mutate(d)}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {file?.status === "building" && (
            <Button
              variant="cta"
              onClick={() => advance.mutate("review_complete")}
              disabled={advance.isPending || (docs ?? []).length === 0}
            >
              <CheckCircle2 className="h-4 w-4" /> Review Complete
            </Button>
          )}
          {file?.status === "review_complete" && (
            <Button variant="cta" onClick={() => advance.mutate("sent_to_audit")} disabled={advance.isPending}>
              <Send className="h-4 w-4" /> Send to Audit tab
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AuditZone() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FolderArchive className="h-6 w-6 text-[color:var(--amber-600)]" />
        <div>
          <h1 className="text-2xl font-semibold">Audit Zone</h1>
          <p className="text-sm text-muted-foreground">
            Pull any record on demand, and build audit-ready monthly folders for the Audit tab.
          </p>
        </div>
      </div>

      <DocumentPull orgId={orgId} />
      <MonthlyAuditFolders orgId={orgId} />
    </div>
  );
}
