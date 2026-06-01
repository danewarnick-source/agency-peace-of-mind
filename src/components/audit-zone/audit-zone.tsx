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

function DocumentPull({ orgId }: { orgId?: string }) {
  const [type, setType] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");

  const { data, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["audit-pull", orgId, type, from, to, clientFilter, staffFilter, query],
    queryFn: async () => {
      const rows: PulledRow[] = [];
      const fromTs = from ? new Date(from).toISOString() : null;
      const toTs = to ? new Date(to + "T23:59:59").toISOString() : null;

      const wantsAll = type === "all";

      // EVV timesheets
      if (wantsAll || type === "evv") {
        let q = supabase
          .from("evv_timesheets")
          .select("id, clock_in_timestamp, client_id, staff_id")
          .eq("organization_id", orgId!)
          .order("clock_in_timestamp", { ascending: false })
          .limit(50);
        if (fromTs) q = q.gte("clock_in_timestamp", fromTs);
        if (toTs) q = q.lte("clock_in_timestamp", toTs);
        const { data: ts } = await q;
        (ts ?? []).forEach((t: any) =>
          rows.push({
            id: `evv:${t.id}`,
            type: "EVV Timesheet",
            title: `Timesheet ${format(new Date(t.clock_in_timestamp), "MMM d, yyyy p")}`,
            date: t.clock_in_timestamp,
            client_id: t.client_id,
            staff_id: t.staff_id,
          }),
        );
      }

      // Client documents
      if (wantsAll || type === "client") {
        let q = supabase
          .from("client_documents")
          .select("id, title, created_at, client_id")
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(50);
        if (fromTs) q = q.gte("created_at", fromTs);
        if (toTs) q = q.lte("created_at", toTs);
        const { data: cd } = await q;
        (cd ?? []).forEach((d: any) =>
          rows.push({
            id: `client_doc:${d.id}`,
            type: "Client Document",
            title: d.title ?? "Untitled",
            date: d.created_at,
            client_id: d.client_id,
          }),
        );
      }

      // Billing
      if (wantsAll || type === "billing") {
        let q = supabase
          .from("billing_submissions")
          .select("id, period_start, period_end, status, created_at")
          .eq("organization_id", orgId!)
          .order("period_start", { ascending: false })
          .limit(50);
        if (from) q = q.gte("period_start", from);
        if (to) q = q.lte("period_start", to);
        const { data: bs } = await q;
        (bs ?? []).forEach((s: any) =>
          rows.push({
            id: `billing:${s.id}`,
            type: "520 Billing Submission",
            title: `520 — ${format(new Date(s.period_start), "MMMM yyyy")}`,
            subtitle: s.status,
            date: s.period_start,
          }),
        );
      }

      // Incidents
      if (wantsAll || type === "incident") {
        let q = supabase
          .from("incident_reports")
          .select("id, summary, submitted_at, client_id")
          .eq("organization_id", orgId!)
          .order("submitted_at", { ascending: false })
          .limit(50);
        if (fromTs) q = q.gte("submitted_at", fromTs);
        if (toTs) q = q.lte("submitted_at", toTs);
        const { data: ir } = await q;
        (ir ?? []).forEach((r: any) =>
          rows.push({
            id: `incident:${r.id}`,
            type: "Incident Report",
            title: r.summary ?? "Incident report",
            date: r.submitted_at,
            client_id: r.client_id,
          }),
        );
      }

      // Client spending log (hourly shifts)
      if (wantsAll || type === "client_spending") {
        let q = supabase
          .from("client_spending_log")
          .select("id, amount, purpose, spent_at, client_id, staff_id, shift_id")
          .eq("organization_id", orgId!)
          .order("spent_at", { ascending: false })
          .limit(50);
        if (fromTs) q = q.gte("spent_at", fromTs);
        if (toTs) q = q.lte("spent_at", toTs);
        const { data: cs } = await q;
        (cs ?? []).forEach((r: any) =>
          rows.push({
            id: `client_spending:${r.id}`,
            type: "Client Spending",
            title: `$${Number(r.amount).toFixed(2)} — ${r.purpose}`,
            subtitle: `Shift ${String(r.shift_id).slice(0, 8)}`,
            date: r.spent_at,
            client_id: r.client_id,
            staff_id: r.staff_id,
          }),
        );
      }

      let filtered = rows;
      if (query.trim()) {
        const qLow = query.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.title.toLowerCase().includes(qLow) ||
            r.type.toLowerCase().includes(qLow),
        );
      }
      if (clientFilter.trim()) {
        filtered = filtered.filter((r) => (r.client_id ?? "").includes(clientFilter.trim()));
      }
      if (staffFilter.trim()) {
        filtered = filtered.filter((r) => (r.staff_id ?? "").includes(staffFilter.trim()));
      }
      return filtered.sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : 0));
    },
  });

  return (
    <Card className="bg-card/60 backdrop-blur border-[color:var(--border-light)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4 text-[color:var(--amber-600)]" />
          Pull a document or report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Search</Label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. timesheet, 520, intake" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="evv">EVV / Timesheets</SelectItem>
                <SelectItem value="billing">Billing (520)</SelectItem>
                <SelectItem value="client">Client docs</SelectItem>
                <SelectItem value="incident">Incidents</SelectItem>
                <SelectItem value="client_spending">Client Spending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Client ID contains</Label>
            <Input value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} placeholder="optional" />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs">Staff ID contains</Label>
            <Input value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} placeholder="optional" />
          </div>
        </div>

        <div className="rounded-md border border-[color:var(--border-light)] divide-y">
          {isLoading && (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Pulling records…
            </div>
          )}
          {!isLoading && (data ?? []).length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">No records match those filters.</div>
          )}
          {(data ?? []).slice(0, 100).map((r) => (
            <div key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm truncate">{r.title}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.type}{r.subtitle ? ` · ${r.subtitle}` : ""}{r.date ? ` · ${format(new Date(r.date), "MMM d, yyyy")}` : ""}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0">{r.type.split(" ")[0]}</Badge>
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
