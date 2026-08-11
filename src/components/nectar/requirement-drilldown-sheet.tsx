import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Upload,
  PenLine,
  Hexagon,
  Loader2,
  ExternalLink,
  FileText,
} from "lucide-react";
import {
  getRequirementDrillDown,
  recordComplianceEvidence,
} from "@/lib/authoritative-sources.functions";
import { useNavigate } from "@tanstack/react-router";

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

type Evidence = {
  id: string;
  evidence_type: "attestation" | "upload" | "both" | null;
  statement: string;
  document_path: string | null;
  document_label: string | null;
  document_url: string | null;
  external_reference: string | null;
  completed_at: string | null;
  attested_at: string;
  recorded_by_name: string | null;
};

interface RequirementDrillDownSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  requirementId: string;
  requirementTitle: string;
}

export function RequirementDrillDownSheet({
  open,
  onOpenChange,
  orgId,
  requirementId,
  requirementTitle,
}: RequirementDrillDownSheetProps) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getRequirementDrillDown);
  const { data, isLoading } = useQuery({
    queryKey: ["requirement-drilldown", orgId, requirementId],
    queryFn: () => fetchFn({ data: { organizationId: orgId, requirementId } }),
    enabled: open && !!orgId && !!requirementId,
  });

  const recordFn = useServerFn(recordComplianceEvidence);
  const recordEvidence = async (vars: {
    coversStaffId?: string;
    coversClientId?: string;
    coversInstanceId?: string;
    evidenceType: "attestation" | "upload" | "both";
    statement?: string;
    completedAt?: string;
    externalReference?: string;
    file?: File | null;
  }) => {
    const { file, ...rest } = vars;
    let fileBase64: string | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    if (file) {
      fileBase64 = await fileToBase64(file);
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
    }
    return recordFn({
      data: {
        organizationId: orgId,
        requirementId,
        fileBase64,
        fileName,
        mimeType,
        ...rest,
      },
    });
  };

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["requirement-drilldown", orgId, requirementId] });

  const req = data?.req as
    | {
        title: string;
        source_citation: string | null;
        category: string | null;
        compliance_pattern: string | null;
        verification_type: string | null;
        feature_link: {
          feature?: string;
          view_existing_label?: string;
          report_route?: string;
        } | null;
      }
    | null
    | undefined;

  const isExternal = (req?.verification_type ?? "external") !== "internal";
  const navigate = useNavigate();

  const { total, complete } = useMemo(() => {
    if (!data) return { total: 0, complete: 0 };
    if (data.kind === "per_staff") {
      const staff = data.staff ?? [];
      const done = staff.filter(
        (s: { user_id: string }) => (data.evidenceByStaff?.[s.user_id]?.length ?? 0) > 0,
      ).length;
      return { total: staff.length, complete: done };
    }
    if (data.kind === "per_client") {
      const clients = data.clients ?? [];
      const done = clients.filter(
        (c: { id: string }) => (data.evidenceByClient?.[c.id]?.length ?? 0) > 0,
      ).length;
      return { total: clients.length, complete: done };
    }
    if (data.kind === "per_event") {
      const instances = data.instances ?? [];
      const done = instances.filter((i: { status: string }) => i.status === "resolved").length;
      return { total: instances.length, complete: done };
    }
    return { total: 0, complete: 0 };
  }, [data]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            {req?.category && (
              <Badge variant="outline" className="text-[10px]">
                {req.category}
              </Badge>
            )}
            {req?.compliance_pattern && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {req.compliance_pattern.replace(/_/g, " ")}
              </Badge>
            )}
            <Badge
              className={`text-[10px] ${isExternal ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" : "bg-teal-500/15 text-teal-700 dark:text-teal-300"}`}
            >
              {isExternal ? "↗ External" : "⬡ Internal"}
            </Badge>
          </div>
          <SheetTitle className="break-words">{req?.title ?? requirementTitle}</SheetTitle>
          {req?.source_citation && (
            <SheetDescription className="break-words text-xs">
              {req.source_citation}
            </SheetDescription>
          )}
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance status…
          </div>
        )}

        {!isLoading && data && (
          <div className="mt-2 space-y-4 pb-8">
            {total > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {complete} of {total} {data.kind === "per_event" ? "events" : "people"}{" "}
                    complete
                  </span>
                  <span>{total > 0 ? Math.round((complete / total) * 100) : 0}%</span>
                </div>
                <Progress value={total > 0 ? (complete / total) * 100 : 0} className="h-2" />
              </div>
            )}

            {isExternal ? (
              <div className="rounded-lg border border-blue-500/30 bg-blue-50/40 p-3 text-xs text-blue-900/80 dark:bg-blue-500/5 dark:text-blue-200/80">
                Upload certificates and add attestations directly on each person below.
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-teal-500/30 bg-teal-50/40 p-3 text-xs text-teal-900/80 dark:bg-teal-500/5 dark:text-teal-200/80">
                <p>
                  Status pulled automatically from{" "}
                  {req?.feature_link?.view_existing_label ?? "the linked feature"}. To resolve
                  gaps, go to {req?.feature_link?.view_existing_label ?? "the linked feature"}.
                </p>
                {req?.feature_link?.report_route && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => navigate({ to: req.feature_link!.report_route! })}
                  >
                    Go to {req.feature_link.view_existing_label ?? "feature"}{" "}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>
            )}

            {data.kind === "per_staff" && (
              <div className="space-y-2">
                {(data.staff ?? []).map((s: { user_id: string; full_name: string; job_title: string | null }) => (
                  <PersonRow
                    key={s.user_id}
                    label={s.full_name}
                    sublabel={s.job_title}
                    avatarBg="#fef3c7"
                    evidence={data.evidenceByStaff?.[s.user_id] ?? []}
                    isExternal={isExternal}
                    featureLink={req?.feature_link ?? null}
                    onRecord={(vars) =>
                      recordEvidence({ coversStaffId: s.user_id, ...vars })
                    }
                    onRecorded={invalidate}
                  />
                ))}
                {(data.staff ?? []).length === 0 && (
                  <EmptyNote text="No active staff found for this organization." />
                )}
              </div>
            )}

            {data.kind === "per_client" && (
              <div className="space-y-2">
                {(data.clients ?? []).map(
                  (c: { id: string; first_name: string; last_name: string }) => (
                    <PersonRow
                      key={c.id}
                      label={`${c.first_name} ${c.last_name}`}
                      sublabel={null}
                      avatarBg="#e0e7ff"
                      evidence={data.evidenceByClient?.[c.id] ?? []}
                      isExternal={isExternal}
                      featureLink={req?.feature_link ?? null}
                      onRecord={(vars) =>
                        recordEvidence({ coversClientId: c.id, ...vars })
                      }
                      onRecorded={invalidate}
                    />
                  ),
                )}
                {(data.clients ?? []).length === 0 && (
                  <EmptyNote text="No active clients found for this organization." />
                )}
              </div>
            )}

            {data.kind === "per_event" && (
              <div className="space-y-2">
                {(data.instances ?? []).map(
                  (inst: {
                    id: string;
                    triggered_by_kind: string | null;
                    triggered_at: string;
                    deadline_at: string;
                    status: string;
                  }) => {
                    const overdue =
                      inst.status === "open" && new Date(inst.deadline_at) < new Date();
                    return (
                      <PersonRow
                        key={inst.id}
                        label={`${inst.triggered_by_kind ?? "Event"} — ${new Date(inst.triggered_at).toLocaleDateString()}`}
                        sublabel={`Deadline ${new Date(inst.deadline_at).toLocaleDateString()}`}
                        avatarBg="#fce7f3"
                        statusOverride={
                          inst.status === "resolved" ? "complete" : overdue ? "overdue" : "missing"
                        }
                        evidence={data.evidenceByInstance?.[inst.id] ?? []}
                        isExternal={isExternal}
                        featureLink={req?.feature_link ?? null}
                        onRecord={(vars) =>
                          recordEvidence({ coversInstanceId: inst.id, ...vars })
                        }
                        onRecorded={invalidate}
                      />
                    );
                  },
                )}
                {(data.instances ?? []).length === 0 && (
                  <EmptyNote text="No events have triggered this requirement yet." />
                )}
              </div>
            )}

            {data.kind === "org_wide" && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Attestation history
                </p>
                <EvidenceHistory evidence={(data.history ?? []) as Evidence[]} />
                <RecordEvidenceForm
                  isExternal
                  onSubmit={(vars) => recordEvidence(vars).then(invalidate)}
                />
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">{text}</p>;
}

function statusBadge(status: "complete" | "overdue" | "missing") {
  if (status === "complete")
    return (
      <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Complete
      </Badge>
    );
  if (status === "overdue")
    return (
      <Badge className="bg-red-500/15 text-[10px] text-red-700 dark:text-red-300">
        <AlertTriangle className="mr-1 h-3 w-3" /> Overdue
      </Badge>
    );
  return (
    <Badge className="bg-amber-500/15 text-[10px] text-amber-800 dark:text-amber-200">
      <Clock className="mr-1 h-3 w-3" /> Missing
    </Badge>
  );
}

function PersonRow({
  label,
  sublabel,
  avatarBg,
  evidence,
  isExternal,
  featureLink,
  statusOverride,
  onRecord,
  onRecorded,
}: {
  label: string;
  sublabel?: string | null;
  avatarBg: string;
  evidence: Evidence[];
  isExternal: boolean;
  featureLink: { view_existing_label?: string; report_route?: string } | null;
  statusOverride?: "complete" | "overdue" | "missing";
  onRecord: (vars: {
    evidenceType: "attestation" | "upload" | "both";
    statement?: string;
    completedAt?: string;
    externalReference?: string;
    file?: File | null;
  }) => Promise<{ ok: boolean; attestationId: string }>;
  onRecorded: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = statusOverride ?? (evidence.length > 0 ? "complete" : "missing");
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-border/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback style={{ backgroundColor: avatarBg }} className="text-[10px] text-foreground/80">
            {label.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{label}</p>
          {sublabel && <p className="truncate text-xs text-muted-foreground">{sublabel}</p>}
        </div>
        {statusBadge(status)}
        {evidence.length > 0 && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {evidence.length} file{evidence.length === 1 ? "" : "s"}
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border/60 p-3">
          <EvidenceHistory evidence={evidence} />

          {isExternal ? (
            <RecordEvidenceForm
              isExternal
              onSubmit={(vars) => onRecord(vars).then(onRecorded)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {featureLink?.report_route && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => navigate({ to: featureLink.report_route! })}
                >
                  Go to {featureLink.view_existing_label ?? "feature"}
                </Button>
              )}
              <RecordEvidenceForm
                isExternal={false}
                fallback
                onSubmit={(vars) => onRecord(vars).then(onRecorded)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceHistory({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">No evidence recorded yet.</p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {evidence.map((e) => {
        const icon =
          e.evidence_type === "upload" ? (
            <FileText className="h-3 w-3" />
          ) : e.evidence_type === "both" ? (
            <Hexagon className="h-3 w-3" />
          ) : (
            <PenLine className="h-3 w-3" />
          );
        const label = (e.document_label || e.statement || "").slice(0, 80);
        return (
          <li
            key={e.id}
            className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 p-2 text-xs"
          >
            <span className="mt-0.5 text-muted-foreground">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {e.document_url ? (
                  <a
                    href={e.document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {label}
                  </a>
                ) : (
                  label
                )}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(e.attested_at).toLocaleString()}
                {e.recorded_by_name ? ` — ${e.recorded_by_name}` : ""}
                {e.external_reference ? ` — ref ${e.external_reference}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RecordEvidenceForm({
  isExternal,
  fallback = false,
  onSubmit,
}: {
  isExternal: boolean;
  fallback?: boolean;
  onSubmit: (vars: {
    evidenceType: "attestation" | "upload" | "both";
    statement?: string;
    completedAt?: string;
    externalReference?: string;
    file?: File | null;
  }) => Promise<void>;
}) {
  const [attestOpen, setAttestOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => onSubmit({ evidenceType: "upload", file }),
    onSuccess: () => {
      toast.success("Document uploaded.");
      if (fileInput.current) fileInput.current.value = "";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attestMut = useMutation({
    mutationFn: async () =>
      onSubmit({
        evidenceType: "attestation",
        statement,
        completedAt: completedAt || undefined,
        externalReference: externalReference || undefined,
      }),
    onSuccess: () => {
      toast.success("Attestation recorded.");
      setStatement("");
      setCompletedAt("");
      setExternalReference("");
      setAttestOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={uploadMut.isPending}
          onClick={() => fileInput.current?.click()}
        >
          {uploadMut.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Upload className="mr-1 h-3 w-3" />
          )}
          {fallback ? "Add manual record (fallback)" : "+ Upload document"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadMut.mutate(f);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => setAttestOpen((v) => !v)}
        >
          <PenLine className="mr-1 h-3 w-3" /> + Add attestation
        </Button>
      </div>

      {attestOpen && (
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <div>
            <Label className="text-[10px]">Statement</Label>
            <Textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Describe what was completed and how it was verified…"
              className="min-h-[60px] text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Date completed</Label>
              <Input
                type="date"
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">External reference (optional)</Label>
              <Input
                value={externalReference}
                onChange={(e) => setExternalReference(e.target.value)}
                placeholder="UPI confirmation #…"
                className="h-7 text-xs"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="h-7 text-[11px]"
            disabled={statement.trim().length < 10 || attestMut.isPending}
            onClick={() => attestMut.mutate()}
          >
            {attestMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save attestation
          </Button>
        </div>
      )}
    </div>
  );
}
