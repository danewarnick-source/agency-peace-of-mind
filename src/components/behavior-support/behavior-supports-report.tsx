import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileDown, Printer, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  BC_CONFIG, evaluateCredentialMatch, type BcCode,
} from "@/lib/behavior-support";

type ClientRow = { id: string; first_name: string | null; last_name: string | null };
type BscRow = {
  client_id: string;
  bc_code: BcCode;
  features_enabled: boolean;
  assigned_behaviorist_user_id: string | null;
};
type Profile = { id: string; full_name: string | null; email: string | null; bc_role: BcCode | null };

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");
const fmtDay = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
const csvEsc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map(csvEsc).join(",")).join("\n");
const dl = (filename: string, content: string, mime = "text/csv") => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export function BehaviorSupportsReport() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const today = new Date();
  const thirtyAgo = new Date(today.getTime() - 30 * 86400_000);
  const [from, setFrom] = useState(thirtyAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [behavioristFilter, setBehavioristFilter] = useState<string>("all");
  const [codeFilter, setCodeFilter] = useState<string>("all");

  const { data: bscRows = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["bs-report-bsc", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("behavior_support_clients")
        .select("client_id,bc_code,features_enabled,assigned_behaviorist_user_id")
        .eq("organization_id", orgId!)
        .eq("features_enabled", true);
      return (data ?? []) as BscRow[];
    },
  });

  const clientIds = useMemo(() => bscRows.map((r) => r.client_id), [bscRows]);
  const behavioristIds = useMemo(
    () => Array.from(new Set(bscRows.map((r) => r.assigned_behaviorist_user_id).filter(Boolean) as string[])),
    [bscRows],
  );

  const { data: clients = [] } = useQuery({
    enabled: !!orgId && clientIds.length > 0,
    queryKey: ["bs-report-clients", orgId, clientIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id,first_name,last_name")
        .in("id", clientIds);
      return (data ?? []) as ClientRow[];
    },
  });

  const { data: behaviorists = [] } = useQuery({
    enabled: behavioristIds.length > 0,
    queryKey: ["bs-report-behaviorists", behavioristIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,email,bc_role")
        .in("id", behavioristIds);
      return (data ?? []) as Profile[];
    },
  });

  // Apply filters → effective clientIds
  const effectiveClientIds = useMemo(() => {
    return bscRows
      .filter((r) => clientFilter === "all" || r.client_id === clientFilter)
      .filter((r) => behavioristFilter === "all" || r.assigned_behaviorist_user_id === behavioristFilter)
      .filter((r) => codeFilter === "all" || r.bc_code === codeFilter)
      .map((r) => r.client_id);
  }, [bscRows, clientFilter, behavioristFilter, codeFilter]);

  const fromIso = `${from}T00:00:00Z`;
  const toIso = `${to}T23:59:59Z`;

  const { data: packet, isFetching } = useQuery({
    enabled: !!orgId && effectiveClientIds.length > 0,
    queryKey: ["bs-report-packet", orgId, effectiveClientIds, fromIso, toIso],
    queryFn: async () => {
      const [behRes, entryRes, docRes, noteRes, flagRes] = await Promise.all([
        supabase.from("bc_behaviors").select("*").in("client_id", effectiveClientIds),
        supabase
          .from("bc_data_entries")
          .select("*")
          .in("client_id", effectiveClientIds)
          .gte("occurred_at", fromIso).lte("occurred_at", toIso)
          .order("occurred_at", { ascending: false }),
        supabase.from("bc_documents").select("*").in("client_id", effectiveClientIds).eq("is_current", true),
        supabase
          .from("bc_review_notes").select("*")
          .in("client_id", effectiveClientIds)
          .gte("created_at", fromIso).lte("created_at", toIso)
          .order("created_at", { ascending: false }),
        supabase.from("bc_flags").select("*").in("client_id", effectiveClientIds).is("acknowledged_at", null),
      ]);
      return {
        behaviors: behRes.data ?? [],
        entries: entryRes.data ?? [],
        documents: docRes.data ?? [],
        notes: noteRes.data ?? [],
        flags: flagRes.data ?? [],
      };
    },
  });

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    behaviorists.forEach((p) => m.set(p.id, p));
    return m;
  }, [behaviorists]);

  const clientMap = useMemo(() => {
    const m = new Map<string, ClientRow>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);

  const bscMap = useMemo(() => {
    const m = new Map<string, BscRow>();
    bscRows.forEach((r) => m.set(r.client_id, r));
    return m;
  }, [bscRows]);

  const clientName = (id: string) => {
    const c = clientMap.get(id);
    return c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : id.slice(0, 8);
  };

  const exportCsv = () => {
    if (!packet) return toast.error("Nothing to export");
    const lines: string[] = [];
    lines.push("# Behavior Supports Audit Packet");
    lines.push(`# Range: ${from} to ${to}`);
    lines.push("");
    lines.push("## Clients");
    lines.push(toCsv([
      ["client", "bc_code", "behaviorist", "behaviorist_tier", "credential_match"],
      ...effectiveClientIds.map((cid) => {
        const bsc = bscMap.get(cid);
        const bh = bsc?.assigned_behaviorist_user_id ? profileMap.get(bsc.assigned_behaviorist_user_id) : null;
        const match = bsc && bh?.bc_role ? evaluateCredentialMatch(bsc.bc_code, bh.bc_role) : null;
        return [clientName(cid), bsc?.bc_code ?? "", bh?.full_name ?? bh?.email ?? "—", bh?.bc_role ?? "—", match ? (match.ok ? "OK" : "MISMATCH") : "—"];
      }),
    ]));
    lines.push(""); lines.push("## Documents (current FBA/BSP)");
    lines.push(toCsv([
      ["client", "doc_type", "version", "uploaded_at", "uploaded_by"],
      ...packet.documents.map((d) => [clientName(d.client_id), d.doc_type, d.version, fmt(d.uploaded_at), d.uploaded_by_user_id ?? ""]),
    ]));
    lines.push(""); lines.push("## Target Behaviors");
    lines.push(toCsv([
      ["client", "name", "operational_definition", "data_method", "expected_cadence", "status", "bsp_citation", "approved_at", "published_at"],
      ...packet.behaviors.map((b) => [clientName(b.client_id), b.name, b.operational_definition ?? "", b.data_method ?? "", b.expected_cadence ?? "", b.status, b.bsp_citation ?? "", fmt(b.approved_at), fmt(b.published_at)]),
    ]));
    lines.push(""); lines.push("## Data Entries");
    lines.push(toCsv([
      ["occurred_at", "client", "behavior_id", "staff_user_id", "count", "intensity", "duration_seconds", "abc_antecedent", "abc_behavior", "abc_consequence", "note"],
      ...packet.entries.map((e) => [fmt(e.occurred_at), clientName(e.client_id), e.behavior_id, e.staff_user_id ?? "", e.count ?? "", e.intensity ?? "", e.duration_seconds ?? "", e.abc_antecedent ?? "", e.abc_behavior ?? "", e.abc_consequence ?? "", e.note ?? ""]),
    ]));
    lines.push(""); lines.push("## Notes / Reviews");
    lines.push(toCsv([
      ["client", "created_at", "note_type", "author", "period_start", "period_end", "body"],
      ...packet.notes.map((n) => [clientName(n.client_id), fmt(n.created_at), n.note_type, n.author_user_id ?? "", n.period_start ?? "", n.period_end ?? "", n.body ?? ""]),
    ]));
    lines.push(""); lines.push("## Open Flags");
    lines.push(toCsv([
      ["client", "flag_type", "detail", "created_at"],
      ...packet.flags.map((f) => [clientName(f.client_id), f.flag_type, JSON.stringify(f.detail ?? {}), fmt(f.created_at)]),
    ]));
    dl(`behavior-supports-${from}_to_${to}.csv`, lines.join("\n"));
    toast.success("CSV exported");
  };

  const exportPdf = () => {
    if (!packet) return toast.error("Nothing to export");
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return toast.error("Pop-up blocked");
    const css = `
      body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#111;padding:32px;max-width:780px;margin:auto}
      h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
      h3{font-size:13px;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
      th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#f3f4f6}.muted{color:#666;font-size:11px}
      .badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;background:#eef}
      .bad{color:#b00}.ok{color:#070}
      @media print{body{padding:16px}}
    `;
    const tbl = (head: string[], rows: (string | number | null | undefined)[][]) =>
      `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
        rows.length === 0
          ? `<tr><td colspan="${head.length}" class="muted">None</td></tr>`
          : rows.map((r) => `<tr>${r.map((c) => `<td>${String(c ?? "").replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("")
      }</tbody></table>`;

    const sections = effectiveClientIds.map((cid) => {
      const bsc = bscMap.get(cid)!;
      const bh = bsc.assigned_behaviorist_user_id ? profileMap.get(bsc.assigned_behaviorist_user_id) : null;
      const match = bh?.bc_role ? evaluateCredentialMatch(bsc.bc_code, bh.bc_role) : null;
      const behs = packet.behaviors.filter((b) => b.client_id === cid);
      const ents = packet.entries.filter((e) => e.client_id === cid);
      const docs = packet.documents.filter((d) => d.client_id === cid);
      const notes = packet.notes.filter((n) => n.client_id === cid);
      const flags = packet.flags.filter((f) => f.client_id === cid);
      const coverage = behs.filter((b) => b.status === "published").map((b) => {
        const last = ents.filter((e) => e.behavior_id === b.id).sort((a, c) => (c.occurred_at > a.occurred_at ? 1 : -1))[0];
        return [b.name, b.expected_cadence ?? "—", last ? fmt(last.occurred_at) : "No entries"];
      });

      return `
        <h2>${clientName(cid)} — ${bsc.bc_code}</h2>
        <p class="muted">Severity: ${BC_CONFIG[bsc.bc_code].severity} · Oversight: ${BC_CONFIG[bsc.bc_code].oversight}</p>
        <p>Behaviorist: <b>${bh?.full_name ?? bh?.email ?? "Unassigned"}</b> (${bh?.bc_role ?? "—"})
          ${match ? `<span class="${match.ok ? "ok" : "bad"}">— ${match.ok ? "Credential OK" : "Credential MISMATCH"}</span>` : ""}</p>
        <h3>FBA / BSP on file</h3>
        ${tbl(["Type", "Version", "Uploaded", "Uploader"], docs.map((d) => [d.doc_type, d.version, fmt(d.uploaded_at), d.uploaded_by_user_id ?? "—"]))}
        <h3>Target Behaviors</h3>
        ${tbl(["Name", "Definition", "Method", "Cadence", "Status", "BSP Citation", "Approved", "Published"],
          behs.map((b) => [b.name, b.operational_definition ?? "", b.data_method ?? "", b.expected_cadence ?? "", b.status, b.bsp_citation ?? "", fmtDay(b.approved_at), fmtDay(b.published_at)]))}
        <h3>Coverage Summary</h3>
        ${tbl(["Behavior", "Expected Cadence", "Last Logged"], coverage)}
        <h3>Data Entries (${ents.length})</h3>
        ${tbl(["When", "Behavior", "Staff", "Count", "Intensity", "Duration(s)", "ABC"],
          ents.slice(0, 200).map((e) => {
            const b = behs.find((x) => x.id === e.behavior_id);
            const abc = [e.abc_antecedent, e.abc_behavior, e.abc_consequence].filter(Boolean).join(" → ");
            return [fmt(e.occurred_at), b?.name ?? e.behavior_id.slice(0, 8), e.staff_user_id?.slice(0, 8) ?? "—", e.count ?? "", e.intensity ?? "", e.duration_seconds ?? "", abc];
          }))}
        <h3>Notes & Reviews</h3>
        ${tbl(["Date", "Type", "Period", "Body"],
          notes.map((n) => [fmtDay(n.created_at), n.note_type, `${n.period_start ?? ""} – ${n.period_end ?? ""}`, n.body ?? ""]))}
        <h3>Open Flags</h3>
        ${tbl(["Type", "Detail", "Raised"],
          flags.map((f) => [f.flag_type, JSON.stringify(f.detail ?? {}), fmt(f.created_at)]))}
      `;
    }).join("");

    w.document.write(`<!doctype html><html><head><title>Behavior Supports Audit Packet</title><style>${css}</style></head><body>
      <h1>Behavior Supports — Audit Packet</h1>
      <p class="muted">Range ${from} to ${to} · Generated ${new Date().toLocaleString()}</p>
      ${sections}
      <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Client</Label>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientIds.map((id) => (
                  <SelectItem key={id} value={id}>{clientName(id)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Behaviorist</Label>
            <Select value={behavioristFilter} onValueChange={setBehavioristFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {behaviorists.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.full_name ?? b.email ?? b.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">BC Code</Label>
            <Select value={codeFilter} onValueChange={setCodeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="BC1">BC1</SelectItem>
                <SelectItem value="BC2">BC2</SelectItem>
                <SelectItem value="BC3">BC3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {effectiveClientIds.length} client{effectiveClientIds.length === 1 ? "" : "s"} ·{" "}
          {packet?.entries.length ?? 0} data entries · {packet?.flags.length ?? 0} open flags
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!packet || isFetching}>
            <FileDown className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={exportPdf} disabled={!packet || isFetching}>
            <Printer className="mr-2 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {effectiveClientIds.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No clients match the current filters. Behavior Support must be enabled on a client to appear here.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {effectiveClientIds.map((cid) => {
            const bsc = bscMap.get(cid)!;
            const bh = bsc.assigned_behaviorist_user_id ? profileMap.get(bsc.assigned_behaviorist_user_id) : null;
            const match = bh?.bc_role ? evaluateCredentialMatch(bsc.bc_code, bh.bc_role) : null;
            const behs = packet?.behaviors.filter((b) => b.client_id === cid) ?? [];
            const ents = packet?.entries.filter((e) => e.client_id === cid) ?? [];
            const flags = packet?.flags.filter((f) => f.client_id === cid) ?? [];
            return (
              <Card key={cid}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{clientName(cid)}</CardTitle>
                    <Badge variant="secondary">{bsc.bc_code}</Badge>
                    {bh ? (
                      <span className="text-xs text-muted-foreground">
                        Behaviorist: {bh.full_name ?? bh.email} ({bh.bc_role ?? "—"})
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">Unassigned</span>
                    )}
                    {match && (
                      match.ok
                        ? <Badge variant="outline" className="text-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />Credential OK</Badge>
                        : <Badge variant="outline" className="text-rose-700"><AlertTriangle className="h-3 w-3 mr-1" />Mismatch</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="Published behaviors" value={behs.filter((b) => b.status === "published").length} />
                  <Stat label="Drafts / approved" value={behs.filter((b) => b.status !== "published").length} />
                  <Stat label="Entries (range)" value={ents.length} />
                  <Stat label="Open flags" value={flags.length} tone={flags.length ? "warn" : "ok"} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${tone === "warn" ? "text-rose-700" : ""}`}>{value}</p>
    </div>
  );
}
