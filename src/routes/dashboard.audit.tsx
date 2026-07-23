import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentOrg, useOrgDisplayName } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderArchive,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  CircleSlash,
  Eye,
  FileText,
  Loader2,
  Plus,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { parseAndProduceAuditPacket } from "@/lib/audit-packet.functions";
import { AttestationBanner } from "@/components/nectar/attestation-banner";
import { AuditorShareManager } from "@/components/audit/auditor-share-manager";

export const Route = createFileRoute("/dashboard/audit")({
  head: () => ({ meta: [{ title: "Audit — HIVE" }] }),
  component: AuditPage,
});

type Packet = {
  id: string;
  organization_id: string;
  name: string;
  fiscal_year: string;
  provider_name: string;
  timeline_start: string | null;
  timeline_end: string | null;
  expectations_summary: string | null;
  audit_letter_path: string | null;
  status: "draft" | "compiled" | "submitted" | "closed";
  created_at: string;
  predates_go_live_note: string | null;
};

type Item = {
  id: string;
  packet_id: string;
  sub_folder: "staff" | "client" | "admin" | "other";
  title: string;
  description: string | null;
  status: "auto_filled" | "needs_review" | "missing" | "confirmed" | "not_applicable";
  source_hint: string | null;
  evidence_count: number;
  notes: string | null;
  position: number;
};

const statusMeta: Record<Item["status"], { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  auto_filled: {
    label: "Auto-filled",
    cls: "bg-[color:var(--amber-100)] text-[color:var(--navy-900)]",
    icon: Sparkles,
  },
  confirmed: {
    label: "Confirmed",
    cls: "bg-[color:var(--navy-900)] text-white",
    icon: CheckCircle2,
  },
  needs_review: {
    label: "Needs review",
    cls: "bg-[color:var(--surface-2)] text-foreground border border-[color:var(--border-light)]",
    icon: Eye,
  },
  missing: {
    label: "Missing",
    cls: "bg-destructive/10 text-destructive border border-destructive/30",
    icon: AlertTriangle,
  },
  not_applicable: {
    label: "N/A",
    cls: "bg-muted text-muted-foreground",
    icon: CircleSlash,
  },
};

export function AuditPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: packets, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["audit-packets", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_packets")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Packet[];
    },
  });

  if (openId) {
    return <PacketDetail packetId={openId} orgId={orgId!} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="space-y-6" data-tour="audit.body">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FolderArchive className="h-6 w-6 text-[color:var(--amber-600)]" />
          <div>
            <h1 className="text-2xl font-semibold">Audit</h1>
            <p className="text-sm text-muted-foreground">
              Audit folders organized by timeline. Upload a state audit letter and HIVE auto-produces the checklist, grounded in your uploaded SOW and contracts.
            </p>
          </div>
        </div>
        <Button variant="cta" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New audit folder
        </Button>
      </div>

      {orgId && (
        <AttestationBanner
          organizationId={orgId}
          scope="audit_packet"
          mode="nudge"
          compact
          statement="Audit checklists are derived from the SOW, contracts, and requirement documents you uploaded under Authoritative Sources. Items without a traced source are flagged Unverified — review every item for accuracy before submitting to the State."
        />
      )}

      {isLoading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading audit folders…
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(packets ?? []).map((p) => (
          <button
            key={p.id}
            onClick={() => setOpenId(p.id)}
            className="text-left rounded-lg border border-[color:var(--border-light)] bg-card/60 backdrop-blur p-4 hover:border-[color:var(--navy-700)] hover:bg-white transition"
          >
            <div className="flex items-center justify-between gap-2">
              <FolderArchive className="h-5 w-5 text-[color:var(--navy-700)]" />
              <Badge className="bg-[color:var(--surface-2)] text-foreground border-0">{p.status}</Badge>
            </div>
            <div className="mt-3 font-semibold">{p.name}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {p.timeline_start && p.timeline_end
                ? `${format(new Date(p.timeline_start), "MMM d, yyyy")} – ${format(new Date(p.timeline_end), "MMM d, yyyy")}`
                : `Created ${format(new Date(p.created_at), "MMM d, yyyy")}`}
            </div>
          </button>
        ))}
        {(packets ?? []).length === 0 && !isLoading && (
          <Card className="bg-card/60 backdrop-blur border-dashed col-span-full">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No audit folders yet. Click <strong>New audit folder</strong> to start one.
            </CardContent>
          </Card>
        )}
      </div>

      {creating && (
        <NewPacketDialog
          orgId={orgId!}
          onClose={(newId) => {
            setCreating(false);
            if (newId) setOpenId(newId);
          }}
        />
      )}
    </div>
  );
}

function NewPacketDialog({ orgId, onClose }: { orgId: string; onClose: (newId?: string) => void }) {
  const qc = useQueryClient();
  const produce = useServerFn(parseAndProduceAuditPacket);
  const { displayName, legalName } = useOrgDisplayName();
  const placeholderName = displayName || legalName || "Provider name";
  const [providerName, setProviderName] = useState("");
  const [fiscalYear, setFiscalYear] = useState(`FY${String(new Date().getFullYear() % 100).padStart(2, "0")}`);
  const [letterText, setLetterText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [letterPath, setLetterPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (f: File) => {
    setUploading(true);
    try {
      const path = `${orgId}/letters/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage
        .from("audit-documents")
        .upload(path, f, { contentType: f.type });
      if (error) throw error;
      setLetterPath(path);
      // For text-based files, read into the text area too
      if (f.type.startsWith("text/") || f.name.endsWith(".txt") || f.name.endsWith(".md")) {
        const txt = await f.text();
        setLetterText(txt);
      } else {
        toast.info("Letter uploaded. Paste the letter text below so HIVE can extract requirements.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!providerName.trim()) throw new Error("Provider name required");
      if (letterText.trim().length < 50)
        throw new Error("Paste the letter text (or upload a .txt file) so HIVE can extract requirements.");
      return produce({
        data: {
          organization_id: orgId,
          provider_name: providerName.trim(),
          letter_text: letterText.trim(),
          audit_letter_path: letterPath,
          fallback_fiscal_year: fiscalYear,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Audit folder created with ${res.items_created} required items`);
      qc.invalidateQueries({ queryKey: ["audit-packets", orgId] });
      onClose(res.packet_id);
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't produce audit packet"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New audit folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Provider name</Label>
              <Input value={providerName} onChange={(e) => setProviderName(e.target.value)} placeholder={placeholderName} />
            </div>
            <div>
              <Label className="text-xs">Fiscal year</Label>
              <Input value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="FY26" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Audit letter file (optional)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4" /> {letterPath ? "Replace file" : "Upload letter"}
              </Button>
              {letterPath && <span className="text-xs text-muted-foreground truncate">{letterPath.split("/").pop()}</span>}
            </div>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md,.docx,application/pdf,text/plain"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>

          <div>
            <Label className="text-xs">Audit letter text</Label>
            <Textarea
              value={letterText}
              onChange={(e) => setLetterText(e.target.value)}
              rows={10}
              placeholder="Paste the DHS / DSPD audit letter here. HIVE will extract the required items and auto-fill what we already have."
            />
            <p className="text-xs text-muted-foreground mt-1">
              NECTAR proposes the checklist from this text. You'll confirm or override every item in the next step.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose()}>Cancel</Button>
          <Button variant="cta" onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Produce audit packet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PacketDetail({
  packetId,
  orgId,
  onBack,
}: {
  packetId: string;
  orgId: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const { data: packet } = useQuery({
    queryKey: ["audit-packet", packetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_packets")
        .select("*")
        .eq("id", packetId)
        .single();
      if (error) throw error;
      return data as Packet;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["audit-packet-items", packetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_packet_items")
        .select("*")
        .eq("packet_id", packetId)
        .order("sub_folder", { ascending: true })
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  // Pull any Records-Desk audit_files that have been linked or could be linked
  const { data: linkedFiles } = useQuery({
    enabled: !!packetId,
    queryKey: ["audit-files-linked", packetId, orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_files")
        .select("id, period_month, status, audit_packet_id")
        .eq("organization_id", orgId)
        .or(`audit_packet_id.eq.${packetId},and(audit_packet_id.is.null,status.eq.sent_to_audit)`)
        .order("period_month", { ascending: false });
      return data ?? [];
    },
  });

  const setItemStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: Item["status"]; notes?: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const patch: any = { status, reviewed_by: user.user?.id, reviewed_at: new Date().toISOString() };
      if (notes !== undefined) patch.notes = notes;
      const { error } = await supabase.from("audit_packet_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit-packet-items", packetId] }),
    onError: (e: any) => toast.error(e.message ?? "Couldn't update item"),
  });

  const linkFile = useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase
        .from("audit_files")
        .update({ audit_packet_id: packetId })
        .eq("id", fileId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit-files-linked", packetId, orgId] }),
  });

  const advance = useMutation({
    mutationFn: async (status: Packet["status"]) => {
      const { error } = await supabase.from("audit_packets").update({ status }).eq("id", packetId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit-packet", packetId] });
      qc.invalidateQueries({ queryKey: ["audit-packets", orgId] });
    },
  });

  const counts = useMemo(() => {
    const c = { total: 0, missing: 0, needs_review: 0, auto_filled: 0, confirmed: 0 };
    (items ?? []).forEach((it) => {
      c.total++;
      if (it.status === "missing") c.missing++;
      else if (it.status === "needs_review") c.needs_review++;
      else if (it.status === "auto_filled") c.auto_filled++;
      else if (it.status === "confirmed") c.confirmed++;
    });
    return c;
  }, [items]);

  const grouped = useMemo(() => {
    const g: Record<Item["sub_folder"], Item[]> = { staff: [], client: [], admin: [], other: [] };
    (items ?? []).forEach((it) => g[it.sub_folder].push(it));
    return g;
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <FolderArchive className="h-4 w-4" /> Audit
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{packet?.name ?? "Folder"}</span>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to Audit
        </Button>
        <div className="flex gap-2">
          {packet?.status === "draft" && (
            <Button variant="cta" onClick={() => advance.mutate("compiled")}>
              <CheckCircle2 className="h-4 w-4" /> Mark compiled
            </Button>
          )}
          {packet?.status === "compiled" && (
            <Button variant="cta" onClick={() => advance.mutate("submitted")}>
              <CheckCircle2 className="h-4 w-4" /> Mark submitted
            </Button>
          )}
        </div>
      </div>

      <Card className="bg-card/60 backdrop-blur border-[color:var(--border-light)]">
        <CardHeader>
          <CardTitle className="text-base">Audit Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
            <Stat label="Items" value={counts.total} />
            <Stat label="Auto-filled" value={counts.auto_filled} accent="amber" />
            <Stat label="Confirmed" value={counts.confirmed} accent="navy" />
            <Stat label="Needs review" value={counts.needs_review} />
            <Stat label="Missing" value={counts.missing} accent={counts.missing > 0 ? "red" : undefined} />
          </div>
          {packet?.expectations_summary && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Expectations: </span>
              {packet.expectations_summary}
            </p>
          )}
          {packet?.predates_go_live_note && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{packet.predates_go_live_note}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {(["staff", "client", "admin", "other"] as const).map((folder) => (
        <Card key={folder} className="bg-card/60 backdrop-blur border-[color:var(--border-light)]">
          <CardHeader>
            <CardTitle className="text-sm capitalize flex items-center gap-2">
              <FolderArchive className="h-4 w-4 text-[color:var(--navy-700)]" />
              {folder} <span className="text-muted-foreground font-normal">({grouped[folder].length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {grouped[folder].length === 0 && (
              <div className="text-xs text-muted-foreground">No items in this sub-folder.</div>
            )}
            {grouped[folder].map((it) => {
              const meta = statusMeta[it.status];
              const Icon = meta.icon;
              return (
                <div
                  key={it.id}
                  className="rounded-md border border-[color:var(--border-light)] bg-white/70 p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{it.title}</span>
                    </div>
                    {it.description && (
                      <div className="text-xs text-muted-foreground mt-1">{it.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {it.source_hint && <span>Source: {it.source_hint} · </span>}
                      {it.evidence_count > 0 && <span>{it.evidence_count} record(s) on platform</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={meta.cls + " border-0"}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                    <Select
                      value={it.status}
                      onValueChange={(v) => setItemStatus.mutate({ id: it.id, status: v as Item["status"] })}
                    >
                      <SelectTrigger className="h-7 w-[150px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto_filled">Auto-filled</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="needs_review">Needs review</SelectItem>
                        <SelectItem value="missing">Missing</SelectItem>
                        <SelectItem value="not_applicable">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card className="bg-card/60 backdrop-blur border-[color:var(--border-light)]">
        <CardHeader>
          <CardTitle className="text-sm">Linked Records-Desk audit files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(linkedFiles ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground">
              When admins click <strong>Review Complete</strong> in the Records Desk Audit Zone, those monthly files appear here for attachment.
            </div>
          )}
          {(linkedFiles ?? []).map((f: any) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border-light)] bg-white/70 px-3 py-2"
            >
              <div className="text-sm">
                <span className="font-medium">{format(new Date(f.period_month), "MMMM yyyy")}</span>
                <span className="text-xs text-muted-foreground ml-2">({f.status.replace("_", " ")})</span>
              </div>
              {f.audit_packet_id === packetId ? (
                <Badge className="bg-[color:var(--navy-900)] text-white border-0">Linked</Badge>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => linkFile.mutate(f.id)}>
                  Attach
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {packet && (
        <Card className="bg-card/60 backdrop-blur border-[color:var(--border-light)]">
          <CardHeader>
            <CardTitle className="text-sm">Auditor Access Portal</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditorShareManager
              packetId={packetId}
              packetName={packet.name}
              organizationId={orgId}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "navy" | "red";
}) {
  const accentCls =
    accent === "amber"
      ? "text-[color:var(--amber-600)]"
      : accent === "navy"
      ? "text-[color:var(--navy-900)]"
      : accent === "red"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="rounded-md border border-[color:var(--border-light)] bg-white/70 px-3 py-2">
      <div className={`text-xl font-semibold ${accentCls}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
