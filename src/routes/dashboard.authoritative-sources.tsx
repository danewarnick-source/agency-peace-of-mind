import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileCheck,
  FileText,
  Loader2,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Globe,
  Info,
  Upload,
  ChevronDown,
  Wand2,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

import { SourceCitationChip } from "@/components/nectar/source-citation-chip";
import { AuthoritativeSourceDrop } from "@/components/nectar/authoritative-source-drop";
import { ingestDocument } from "@/lib/nectar-documents.functions";
import {
  listAuthoritativeSources,
  markAsAuthoritativeSource,
  listRequirements,
  generateRequirementsFromSource,
  upsertRequirement,

  setRequirementReviewStatus,
  listAttestations,
  ingestWebSource,
  explainRequirement,
} from "@/lib/authoritative-sources.functions";
import {
  proposeRequirementMappings,
  listRequirementMappings,
  setRequirementMapping,
  deleteRequirementMapping,
  prefillRequirementMappings,
  confirmRequirementWithScopes,
} from "@/lib/nectar-engine.functions";
import { Sparkle, X as XIcon } from "lucide-react";



export const Route = createFileRoute("/dashboard/authoritative-sources")({
  head: () => ({
    meta: [
      { title: "Authoritative Sources — HIVE" },
      {
        name: "description",
        content:
          "Upload your State SOW, contracts, and DSPD/DHS requirement documents. NECTAR reads from these as the source of truth.",
      },
    ],
  }),
  component: AuthoritativeSourcesPage,
});

const AUTH_KINDS = [
  { value: "state_sow", label: "State Scope of Work (SOW)" },
  { value: "provider_contract", label: "Provider contract" },
  { value: "dspd_requirement", label: "DSPD requirement doc" },
  { value: "dhs_requirement", label: "DHS requirement doc" },
  { value: "public_record", label: "Other public-record requirement" },
  { value: "other", label: "Other" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  AUTH_KINDS.map((k) => [k.value, k.label]),
);

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function HowThisWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <Info className="h-3.5 w-3.5" />
        How this works
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-2 max-w-3xl rounded-xl border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-2">
            <strong className="text-foreground">Routing rule:</strong> if a
            document is about one named person, it's a Company Doc; if it's a
            state/contract authority that governs many, it's an Authoritative
            Source.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">PCSPs &amp; 1056 budgets:</strong>{" "}
            These always route to Company Docs — NECTAR extracts the billing data
            (codes, rates, max units, plan dates) from a PCSP into the billing
            layer for that client, while the file itself stays with the client's
            records.
          </p>
          <p>
            <strong className="text-foreground">Unverified flag:</strong> Items
            without a traced source are flagged{" "}
            <span className="font-medium text-amber-700 dark:text-amber-300">
              Unverified
            </span>{" "}
            so authority is never implied.
          </p>
        </div>
      )}
    </div>
  );
}

function AuthoritativeSourcesPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("sources");
  const [focusDocumentId, setFocusDocumentId] = useState<string | null>(null);

  const jumpToRequirements = (docId: string) => {
    setFocusDocumentId(docId);
    setTab("requirements");
  };

  const content = (
    <div className="space-y-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Foundation · Authoritative Sources
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Your contracts &amp; State SOW power everything NECTAR shows
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            State SOW, contracts, and DSPD/DHS requirements — the source of
            truth NECTAR reads from. Every requirement traces back to a clause
            you uploaded.
          </p>
        </div>

        <HowThisWorks />
      </header>

      {orgId && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Review recommended before relying on or submitting. HIVE/NECTAR
            organizes what you upload but does not independently verify accuracy
            or guarantee compliance.
          </span>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 rounded-2xl border border-border/60 bg-background/60 p-1 backdrop-blur">
          <TabsTrigger value="sources" className="gap-1">
            <BookOpen className="h-3.5 w-3.5" /> Sources
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-1">
            <FileCheck className="h-3.5 w-3.5" /> Requirements
          </TabsTrigger>
          <TabsTrigger value="attestations" className="gap-1">
            <ScrollText className="h-3.5 w-3.5" /> Attestation log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          {orgId ? (
            <SourcesPanel orgId={orgId} onJumpToRequirements={jumpToRequirements} />
          ) : (
            <LoadingCard />
          )}
        </TabsContent>
        <TabsContent value="requirements">
          {orgId ? (
            <RequirementsPanel
              orgId={orgId}
              focusDocumentId={focusDocumentId}
              onFocusHandled={() => setFocusDocumentId(null)}
            />
          ) : (
            <LoadingCard />
          )}
        </TabsContent>
        <TabsContent value="attestations">
          {orgId ? <AttestationsPanel orgId={orgId} /> : <LoadingCard />}
        </TabsContent>
      </Tabs>
    </div>
  );

  if (!orgId) return content;
  return (
    <AuthoritativeSourceDrop
      orgId={orgId}
      onUploaded={() =>
        qc.invalidateQueries({ queryKey: ["auth-sources", orgId] })
      }
    >
      {content}
    </AuthoritativeSourceDrop>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-6 text-center text-sm text-muted-foreground backdrop-blur">
      <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

// ---------- Sources panel ----------

function SourcesPanel({
  orgId,
  onJumpToRequirements,
}: {
  orgId: string;
  onJumpToRequirements: (docId: string) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAuthoritativeSources);
  const { data, isLoading } = useQuery({
    queryKey: ["auth-sources", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  // Per-source draft stats so the pill on each row can show
  // total / confirmed / needs / removed and last-drafted time.
  const listReqFn = useServerFn(listRequirements);
  const { data: reqData } = useQuery({
    queryKey: ["requirements", orgId],
    queryFn: () => listReqFn({ data: { organizationId: orgId } }),
  });
  const applicByReq = useApplicabilityByReq(orgId);

  const statsByDoc = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        confirmed: number;
        fullyConfirmed: number;
        scopePending: number;
        needs: number;
        removed: number;
        lastDraftedAt: string | null;
      }
    >();
    type Row = { id: string; source_document_id: string | null; review_status: string | null; verified: boolean | null; created_at: string | null };
    const rows = ((reqData?.requirements ?? []) as unknown) as Row[];
    for (const r of rows) {
      if (!r.source_document_id) continue;
      const cur = map.get(r.source_document_id) ?? {
        total: 0,
        confirmed: 0,
        fullyConfirmed: 0,
        scopePending: 0,
        needs: 0,
        removed: 0,
        lastDraftedAt: null as string | null,
      };
      cur.total += 1;
      const s = r.review_status ?? (r.verified ? "confirmed" : "needs_attention");
      if (s === "confirmed") {
        cur.confirmed += 1;
        if (isScopeReady(applicByReq.get(r.id))) cur.fullyConfirmed += 1;
        else cur.scopePending += 1;
      } else if (s === "removed") cur.removed += 1;
      else cur.needs += 1;
      if (r.created_at && (!cur.lastDraftedAt || r.created_at > cur.lastDraftedAt)) {
        cur.lastDraftedAt = r.created_at;
      }
      map.set(r.source_document_id, cur);
    }
    return map;
  }, [reqData, applicByReq]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-2xl border border-border/60 bg-background/60 p-4 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Authoritative documents on file</h2>
          <Badge variant="outline" className="text-[10px]">
            {data?.sources?.length ?? 0} document
            {(data?.sources?.length ?? 0) === 1 ? "" : "s"}
          </Badge>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : (data?.sources?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No authoritative sources uploaded yet. Upload your State SOW and
            provider contracts to ground HIVE's checklists in your own
            documents.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {data!.sources.map((s) => (
              <SourceRow
                key={s.id as string}
                source={s}
                orgId={orgId}
                stats={statsByDoc.get(s.id as string) ?? null}
                onJumpToRequirements={onJumpToRequirements}
              />
            ))}
          </ul>
        )}
      </div>

      <div data-tour="authsources.upload">
        <UploadCard
          orgId={orgId}
          onUploaded={() => qc.invalidateQueries({ queryKey: ["auth-sources", orgId] })}
        />
      </div>
    </div>
  );
}

function SourceRow({
  source,
  orgId,
  stats,
  onJumpToRequirements,
}: {
  source: { id: string; title: string; authoritative_kind: string | null; fiscal_year: string | null; effective_start: string | null; effective_end: string | null; file_name: string; uploaded_by_name: string | null; created_at: string; parse_status: string | null };
  orgId: string;
  stats:
    | {
        total: number;
        confirmed: number;
        fullyConfirmed: number;
        scopePending: number;
        needs: number;
        removed: number;
        lastDraftedAt: string | null;
      }
    | null;
  onJumpToRequirements: (docId: string) => void;
}) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateRequirementsFromSource);
  const generate = useMutation({
    mutationFn: () => genFn({ data: { documentId: source.id } }),
    onSuccess: (r) => {
      const inserted = (r as { inserted: number }).inserted ?? 0;
      const message = (r as { message?: string }).message;
      if (inserted > 0) {
        toast.success(
          `NECTAR drafted ${inserted} requirement${inserted === 1 ? "" : "s"} from this source. Review them in the Requirements tab.`,
        );
      } else {
        toast.warning(
          message ??
            "NECTAR couldn't draft any requirements from this source. You can add them by hand from the Requirements tab.",
          { duration: 9000 },
        );
      }
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasDraft = !!stats && stats.total > 0;

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{source.title}</span>
          <Badge variant="secondary" className="text-[10px]">
            {KIND_LABEL[source.authoritative_kind ?? "other"] ?? "Source"}
          </Badge>
          {source.parse_status === "parsed" && (
            <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
              Parsed
            </Badge>
          )}
          {source.parse_status === "parsing" && (
            <Badge className="bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-300">
              Parsing…
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>File: {source.file_name}</span>
          {source.fiscal_year && <span>{source.fiscal_year}</span>}
          {source.effective_start && (
            <span>
              Effective {source.effective_start}
              {source.effective_end ? ` → ${source.effective_end}` : ""}
            </span>
          )}
          <span>by {source.uploaded_by_name ?? "—"}</span>
          <span>{new Date(source.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {hasDraft ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onJumpToRequirements(source.id)}
            title={
              stats!.lastDraftedAt
                ? `Last drafted ${new Date(stats!.lastDraftedAt).toLocaleString()} — click to review in the Requirements tab`
                : "Click to review in the Requirements tab"
            }
            className="flex flex-wrap items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-900 transition hover:bg-amber-500/20 dark:text-amber-200"
          >
            <Sparkles className="h-3 w-3" />
            <span>Drafted</span>
            <span className="opacity-70">·</span>
            <span>{stats!.total} total</span>
            <span className="text-emerald-700 dark:text-emerald-300">
              · {stats!.fullyConfirmed} fully confirmed
            </span>
            {stats!.scopePending > 0 && (
              <span
                className="text-[#d97a1c]"
                title="Requirement confirmed but applicability scope not yet confirmed"
              >
                · {stats!.scopePending} scope pending
              </span>
            )}
            <span
              className={
                stats!.needs > 0
                  ? "text-amber-800 dark:text-amber-200"
                  : "opacity-60"
              }
            >
              · {stats!.needs} needs attention
            </span>
            {stats!.removed > 0 && (
              <span className="text-red-700 dark:text-red-300">
                · {stats!.removed} removed
              </span>
            )}
            {stats!.lastDraftedAt && (
              <span className="opacity-60">
                · {new Date(stats!.lastDraftedAt).toLocaleDateString()}
              </span>
            )}
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || source.parse_status !== "parsed"}
            title="Re-draft from this document (e.g. after a re-parse). Existing items are kept; new ones are added."
            className="h-7 px-2 text-[11px]"
          >
            {generate.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Re-draft
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => generate.mutate()}
          disabled={generate.isPending || source.parse_status !== "parsed"}
          title={
            source.parse_status === "parsed"
              ? "Use NECTAR to draft checklist items from clauses found in this document"
              : "Parsing must finish before requirements can be drafted"
          }
        >
          {generate.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-3.5 w-3.5" />
          )}
          Draft requirements
        </Button>
      )}
    </li>
  );
}

function UploadCard({
  orgId,
  onUploaded,
}: {
  orgId: string;
  onUploaded: () => void;
}) {
  const [mode, setMode] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("state_sow");
  const [fiscalYear, setFiscalYear] = useState("");
  const [effectiveStart, setEffectiveStart] = useState("");
  const [effectiveEnd, setEffectiveEnd] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const ingest = useServerFn(ingestDocument);
  const mark = useServerFn(markAsAuthoritativeSource);
  const ingestUrl = useServerFn(ingestWebSource);

  const resetForm = () => {
    setFile(null);
    setUrl("");
    setTitle("");
    setFiscalYear("");
    setEffectiveStart("");
    setEffectiveEnd("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file to upload");
      if (!title.trim()) throw new Error("Title is required");
      const base64 = await fileToBase64(file);
      const docType = kind === "state_sow" ? "sow" : kind === "provider_contract" ? "contract" : "other";
      const r = await ingest({
        data: {
          organizationId: orgId,
          ownerKind: "company",
          documentType: docType as "sow" | "contract" | "other",
          title: title.trim(),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileBase64: base64,
          fiscalYear: fiscalYear || null,
          effectiveStart: effectiveStart || null,
          effectiveEnd: effectiveEnd || null,
          tags: ["authoritative-source", kind],
          autoParse: true,
        },
      });
      const doc = (r as { document?: { id?: string } }).document;
      if (!doc?.id) throw new Error("Upload failed");
      await mark({
        data: {
          documentId: doc.id,
          authoritativeKind: kind as "state_sow" | "provider_contract" | "dspd_requirement" | "dhs_requirement" | "public_record" | "other",
          isAuthoritative: true,
        },
      });
      return doc.id;
    },
    onSuccess: () => {
      toast.success("Source uploaded. NECTAR is parsing in the background.");
      resetForm();
      onUploaded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const captureUrl = useMutation({
    mutationFn: async () => {
      if (!url.trim()) throw new Error("Paste a URL to capture");
      if (!title.trim()) throw new Error("Title is required");
      return ingestUrl({
        data: {
          organizationId: orgId,
          url: url.trim(),
          title: title.trim(),
          authoritativeKind: kind as
            | "state_sow"
            | "provider_contract"
            | "dspd_requirement"
            | "dhs_requirement"
            | "public_record"
            | "other",
          fiscalYear: fiscalYear || null,
          effectiveStart: effectiveStart || null,
          effectiveEnd: effectiveEnd || null,
        },
      });
    },
    onSuccess: (r) => {
      toast.success(
        `Captured ${new URL(r.sourceUrl).host} (${Math.round(r.textLength / 100) / 10}k chars of text). Click "Draft requirements" to extract obligations.`,
        { duration: 7000 },
      );
      resetForm();
      onUploaded();
    },
    onError: (e: Error) => toast.error(e.message, { duration: 9000 }),
  });

  const isUrlMode = mode === "url";
  const submitting = upload.isPending || captureUrl.isPending;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4 backdrop-blur">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Upload className="h-4 w-4" /> Upload authoritative source
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        State SOW, provider contracts, or DSPD/DHS requirement docs. NECTAR
        parses these to derive the required-document checklist your audit and
        billing flows read from.
      </p>

      <div className="mb-3 inline-flex rounded-lg border border-border/60 bg-background/40 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`rounded-md px-3 py-1.5 transition ${
            mode === "file"
              ? "bg-amber-500 text-amber-950"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="mr-1 inline h-3.5 w-3.5" /> File
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`rounded-md px-3 py-1.5 transition ${
            mode === "url"
              ? "bg-amber-500 text-amber-950"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Globe className="mr-1 inline h-3.5 w-3.5" /> Add from URL
        </button>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Document kind</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUTH_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              isUrlMode
                ? "e.g. Utah DHS Provider Requirements page"
                : "e.g. Utah DSPD SOW — FY26"
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Fiscal year</Label>
            <Input
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              placeholder="FY26"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Effective start</Label>
            <Input
              type="date"
              value={effectiveStart}
              onChange={(e) => setEffectiveStart(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Effective end (optional)</Label>
          <Input
            type="date"
            value={effectiveEnd}
            onChange={(e) => setEffectiveEnd(e.target.value)}
          />
        </div>

        {isUrlMode ? (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Page URL</Label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://dspd.utah.gov/providers/requirements"
              />
            </div>
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                NECTAR reads text that's rendered directly on the page itself
                (state policy pages, requirements lists, etc.) and saves a
                snapshot with today's date — the requirement will trace to
                "per [URL], captured [date]". Files <em>linked from</em> the
                page (PDFs, downloadable docs, attachments) are{" "}
                <strong>not</strong> followed. If a rule lives in a linked
                PDF, download that file and upload it as a document instead.
                Pages behind a login or rendered entirely by JavaScript may
                also not be readable.
              </p>
            </div>
            <Button
              className="w-full bg-amber-500 text-amber-950 hover:bg-amber-400"
              onClick={() => captureUrl.mutate()}
              disabled={submitting || !url.trim() || !title.trim()}
            >
              {captureUrl.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Reading page…
                </>
              ) : (
                <>
                  <Globe className="mr-1 h-4 w-4" /> Capture &amp; parse page
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">File (PDF or text)</Label>
              <Input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md,.html,.htm,application/pdf,text/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              className="w-full bg-amber-500 text-amber-950 hover:bg-amber-400"
              onClick={() => upload.mutate()}
              disabled={submitting || !file}
            >
              {upload.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="mr-1 h-4 w-4" /> Upload &amp; parse
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Requirements panel ----------
// Requirements are grouped under the source document NECTAR drafted them
// from. Each group is collapsible, with a per-document review-progress pill
// (total / confirmed / needs attention / removed). Every Confirm, Remove,
// and Re-open hits the immutable attestation log.

type ReviewStatus = "needs_attention" | "confirmed" | "removed";

interface ReqRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  origin: string;
  source_document_id: string | null;
  source_citation: string | null;
  verified: boolean;
  verified_at: string | null;
  review_status: ReviewStatus | string | null;
}

interface SourceMeta {
  id: string;
  title: string;
  authoritative_kind: string | null;
  fiscal_year: string | null;
  file_name: string | null;
  created_at: string | null;
}

interface ReqGroup {
  key: string;
  /** Source-doc id or a synthetic bucket id ("__suggestions" / "__manual"). */
  source: SourceMeta | null;
  /** Group title shown in the header. */
  title: string;
  /** Subtitle / context line. */
  subtitle: string;
  items: ReqRow[];
}

function statusOf(r: ReqRow): ReviewStatus {
  const s = (r.review_status as ReviewStatus | null) ?? null;
  if (s === "confirmed" || s === "removed" || s === "needs_attention") return s;
  // Legacy rows (pre-migration): infer from verified flag.
  return r.verified ? "confirmed" : "needs_attention";
}

// ----- Applicability (NECTAR scope) helpers -----
// A requirement is only "fully reviewed" when both the requirement itself is
// confirmed AND its applicability scope is confirmed. Prompt 30 makes that
// two-step state visible at the row, group, and source-pill level so an admin
// scanning the list immediately sees what still needs review.
export interface ApplicStats {
  total: number;
  confirmed: number;
  pending: number;
  unknown: number;
}

export function isScopeReady(s: ApplicStats | undefined | null): boolean {
  if (!s) return false;
  return s.confirmed > 0 && s.unknown === 0 && s.pending === 0;
}

function useApplicabilityByReq(orgId: string) {
  const listMapFn = useServerFn(listRequirementMappings);
  const q = useQuery({
    queryKey: ["req-mappings-all", orgId],
    queryFn: () => listMapFn({ data: { organizationId: orgId } }),
  });
  const byReq = useMemo(() => {
    const map = new Map<string, ApplicStats>();
    type Row = { requirement_id: string; scope_kind: string; confirmed: boolean };
    const rows = ((q.data?.mappings ?? []) as unknown) as Row[];
    for (const m of rows) {
      const cur = map.get(m.requirement_id) ?? {
        total: 0,
        confirmed: 0,
        pending: 0,
        unknown: 0,
      };
      cur.total += 1;
      if (m.confirmed) cur.confirmed += 1;
      else cur.pending += 1;
      if (m.scope_kind === "unknown" && !m.confirmed) cur.unknown += 1;
      map.set(m.requirement_id, cur);
    }
    return map;
  }, [q.data]);
  return byReq;
}

function RequirementsPanel({
  orgId,
  focusDocumentId,
  onFocusHandled,
}: {
  orgId: string;
  focusDocumentId?: string | null;
  onFocusHandled?: () => void;
}) {
  const listReqFn = useServerFn(listRequirements);
  const { data, isLoading } = useQuery({
    queryKey: ["requirements", orgId],
    queryFn: () => listReqFn({ data: { organizationId: orgId } }),
  });
  const applicByReq = useApplicabilityByReq(orgId);

  const groups = useMemo<ReqGroup[]>(() => {
    const rows = (data?.requirements ?? []) as unknown as ReqRow[];
    const byDoc = new Map<string, ReqRow[]>();
    const suggestions: ReqRow[] = [];
    const manual: ReqRow[] = [];
    for (const r of rows) {
      if (r.origin === "document" && r.source_document_id) {
        const arr = byDoc.get(r.source_document_id) ?? [];
        arr.push(r);
        byDoc.set(r.source_document_id, arr);
      } else if (r.origin === "suggestion") {
        suggestions.push(r);
      } else {
        manual.push(r);
      }
    }
    const sourcesById = (data?.sourcesById ?? {}) as Record<string, SourceMeta>;
    const docGroups: ReqGroup[] = Array.from(byDoc.entries()).map(([id, items]) => {
      const src = sourcesById[id] ?? null;
      return {
        key: id,
        source: src,
        title: src?.title ?? "Source document",
        subtitle:
          (src?.authoritative_kind ? KIND_LABEL[src.authoritative_kind] ?? src.authoritative_kind : "Authoritative source") +
          (src?.fiscal_year ? ` · ${src.fiscal_year}` : ""),
        items,
      };
    });
    // Sort doc groups by needs-attention desc (so review work surfaces first).
    docGroups.sort((a, b) => {
      const na = a.items.filter((i) => statusOf(i) === "needs_attention").length;
      const nb = b.items.filter((i) => statusOf(i) === "needs_attention").length;
      if (nb !== na) return nb - na;
      return a.title.localeCompare(b.title);
    });
    const tail: ReqGroup[] = [];
    if (suggestions.length)
      tail.push({
        key: "__suggestions",
        source: null,
        title: "NECTAR suggestions (no source)",
        subtitle:
          "Commonly required but not traced to a document you uploaded. Confirm or remove each one.",
        items: suggestions,
      });
    if (manual.length)
      tail.push({
        key: "__manual",
        source: null,
        title: "Manual entries",
        subtitle: "Items you added by hand.",
        items: manual,
      });
    return [...docGroups, ...tail];
  }, [data]);

  const outstandingDocs = groups.filter(
    (g) => g.source && g.items.some((i) => statusOf(i) === "needs_attention"),
  ).length;

  // Count authoritative-source items that have been removed — this drives the
  // red high-stakes banner. Suggestion/manual removals don't count toward
  // "audit-readiness changed" because they were never traced to a state doc.
  const removedAuthoritative = useMemo(
    () =>
      groups
        .filter((g) => !!g.source)
        .reduce(
          (n, g) => n + g.items.filter((i) => statusOf(i) === "removed").length,
          0,
        ),
    [groups],
  );

  // Auto-scroll + expand the focused group when the user jumps in from the
  // Sources-tab pill. We scroll on the next frame so the section is in the DOM.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const removedRef = useRef<HTMLDivElement | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  useEffect(() => {
    if (!focusDocumentId) return;
    const id = window.setTimeout(() => {
      const node = containerRef.current?.querySelector<HTMLElement>(
        `[data-req-group-id="${focusDocumentId}"]`,
      );
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
        setHighlightKey(focusDocumentId);
        window.setTimeout(() => setHighlightKey(null), 2200);
      }
      onFocusHandled?.();
    }, 80);
    return () => window.clearTimeout(id);
  }, [focusDocumentId, onFocusHandled]);

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            NECTAR-organized requirements
          </h2>
          <p className="text-xs text-muted-foreground">
            Grouped by the document each was drafted from. Confirm what
            applies, remove what doesn't — both are kept on the record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {outstandingDocs > 0 && (
            <Badge className="bg-amber-500/15 text-[10px] text-amber-800 dark:text-amber-200">
              {outstandingDocs} document{outstandingDocs === 1 ? "" : "s"} need review
            </Badge>
          )}
          <ManualRequirementDialog orgId={orgId} />
        </div>
      </div>

      {removedAuthoritative > 0 && (
        <div
          className="flex flex-col gap-2 rounded-2xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-900 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">
                {removedAuthoritative} authoritative-source requirement
                {removedAuthoritative === 1 ? " has" : "s have"} been removed.
              </p>
              <p className="text-xs opacity-90">
                NECTAR is no longer tracking{" "}
                {removedAuthoritative === 1 ? "this item" : "these items"} for
                audit readiness. Your company may no longer be fully
                state-audit-ready as a result. Review and re-open if any
                removal was accidental.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-red-500/60 bg-background/40 text-red-900 hover:bg-red-500/15 dark:text-red-100"
            onClick={() =>
              removedRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            Review removed items
          </Button>
        </div>
      )}


      {isLoading && (
        <p className="text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-background/60 p-8 text-center text-sm text-muted-foreground">
          No requirements yet. Upload a SOW or contract above, then run
          "Draft requirements" on it — or add one by hand.
        </div>
      )}

      {groups.map((g) => (
        <DocumentRequirementGroup
          key={g.key}
          group={g}
          orgId={orgId}
          applicByReq={applicByReq}
          highlight={highlightKey === g.key}
          forceOpen={focusDocumentId === g.key}
        />
      ))}

      {removedAuthoritative > 0 && (
        <div ref={removedRef} aria-hidden className="-mt-2 pt-2" />
      )}
    </div>
  );
}

function DocumentRequirementGroup({
  group,
  orgId,
  applicByReq,
  highlight = false,
  forceOpen = false,
}: {
  group: ReqGroup;
  orgId: string;
  applicByReq: Map<string, ApplicStats>;
  highlight?: boolean;
  forceOpen?: boolean;
}) {
  const counts = useMemo(() => {
    let fullyConfirmed = 0;
    let scopePending = 0;
    let needs = 0;
    let removed = 0;
    for (const i of group.items) {
      const s = statusOf(i);
      if (s === "confirmed") {
        if (isScopeReady(applicByReq.get(i.id))) fullyConfirmed += 1;
        else scopePending += 1;
      } else if (s === "removed") removed += 1;
      else needs += 1;
    }
    return {
      total: group.items.length,
      confirmed: fullyConfirmed + scopePending,
      fullyConfirmed,
      scopePending,
      needs,
      removed,
    };
  }, [group.items, applicByReq]);

  // Default: expand if there's anything still needing attention.
  const [open, setOpen] = useState(counts.needs > 0);

  // If the user jumped here from the Sources-tab pill, force-expand once.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <section
      data-req-group-id={group.source?.id ?? group.key}
      className={`overflow-hidden rounded-2xl border bg-background/60 backdrop-blur transition-shadow ${
        highlight
          ? "border-amber-500/70 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]"
          : "border-border/60"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {group.source ? (
              <FileText className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            )}
            <h3 className="truncate text-sm font-semibold">{group.title}</h3>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {group.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {counts.total} total
          </Badge>
          <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
            {counts.fullyConfirmed} fully confirmed
          </Badge>
          {counts.scopePending > 0 && (
            <Badge
              className="bg-[#d97a1c]/15 text-[10px] text-[#d97a1c]"
              title="Requirement confirmed, but NECTAR applicability scope still needs review"
            >
              {counts.scopePending} scope pending
            </Badge>
          )}
          <Badge
            className={
              counts.needs > 0
                ? "bg-amber-500/20 text-[10px] text-amber-900 dark:text-amber-200"
                : "bg-muted text-[10px] text-muted-foreground"
            }
          >
            {counts.needs} needs attention
          </Badge>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {counts.removed} removed
          </Badge>
          <span
            className={`ml-1 inline-block text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </div>
      </button>

      {open && (
        <ul className="divide-y divide-border/40 border-t border-border/40 px-4 pb-2">
          {group.items.length === 0 && (
            <li className="py-4 text-xs text-muted-foreground">
              No requirements drafted yet.
            </li>
          )}
          {group.items.map((r) => (
            <RequirementRow
              key={r.id}
              req={r}
              orgId={orgId}
              sourceMeta={group.source}
              applicStats={applicByReq.get(r.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// Attestation copy for the weighted-remove flow. Marked for counsel review
// alongside the other attestation copy in this product.
// LEGAL_REVIEW: requirement-remove-attestation
const REMOVE_ATTESTATION_TEXT =
  "Removing this requirement means NECTAR will no longer track it for audit readiness. This requirement came from an authoritative source you uploaded. By removing it, you confirm this is intentional and accept responsibility for the change to your compliance tracking.";

function RequirementRow({
  req,
  orgId,
  sourceMeta,
  applicStats,
}: {
  req: ReqRow;
  orgId: string;
  sourceMeta?: SourceMeta | null;
  applicStats?: ApplicStats;
}) {
  const qc = useQueryClient();
  const setStatusFn = useServerFn(setRequirementReviewStatus);
  const set = useMutation({
    mutationFn: (vars: { status: ReviewStatus; attestStatement?: string }) =>
      setStatusFn({
        data: { id: req.id, status: vars.status, attestStatement: vars.attestStatement },
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
      qc.invalidateQueries({ queryKey: ["attestations", orgId] });
      if (vars.status === "confirmed") toast.success("Confirmed.");
      else if (vars.status === "removed")
        toast.message("Removed from active use", {
          description:
            "Logged to the attestation trail. NECTAR will stop pulling from this requirement.",
        });
      else toast.message("Re-opened for review.", {
        description:
          "Logged to the attestation trail. NECTAR will resume tracking this requirement once you confirm it.",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = statusOf(req);
  const isRemoved = status === "removed";
  const isConfirmed = status === "confirmed";
  const isFromAuthSource = req.origin === "document" && !!req.source_document_id;

  const [removeOpen, setRemoveOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <li className={`py-3 ${isRemoved ? "opacity-55" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className={`rounded-sm text-left text-sm font-medium underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${isRemoved ? "line-through decoration-muted-foreground/60" : ""}`}
            title="Open full requirement detail"
          >
            {req.title}
          </button>
          {req.category && (
            <Badge variant="outline" className="text-[10px]">
              {req.category}
            </Badge>
          )}
          <SourceCitationChip citation={req.source_citation} />
          {isConfirmed && (() => {
            const ready = isScopeReady(applicStats);
            const hasAny = !!applicStats && applicStats.total > 0;
            const pending = applicStats?.pending ?? 0;
            const unknown = applicStats?.unknown ?? 0;
            if (ready) {
              return (
                <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Fully confirmed
                </Badge>
              );
            }
            return (
              <>
                <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Requirement confirmed
                </Badge>
                <Badge
                  className="bg-[#d97a1c]/15 text-[10px] text-[#d97a1c]"
                  title="Applicability scope still needs to be confirmed below"
                >
                  <Sparkle className="mr-1 h-3 w-3" />
                  Applicability needs review
                  {hasAny
                    ? ` (${pending + unknown} to confirm)`
                    : " (not mapped yet)"}
                </Badge>
              </>
            );
          })()}
          {status === "needs_attention" && (
            <Badge className="bg-amber-500/15 text-[10px] text-amber-800 dark:text-amber-200">
              Needs attention
            </Badge>
          )}
          {isRemoved && (
            <Badge
              variant="outline"
              className="text-[10px] text-red-700 dark:text-red-300"
            >
              Removed — not tracked for audit
            </Badge>
          )}
        </div>
        {req.description && (
          <p className="mt-1 text-xs text-muted-foreground">{req.description}</p>
        )}
        {isConfirmed && req.verified_at && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Confirmed {new Date(req.verified_at).toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-[11px] text-muted-foreground"
          onClick={() => setDetailOpen(true)}
          aria-label="Open requirement detail"
          title="Open requirement detail"
        >
          <Info className="mr-1 h-3.5 w-3.5" /> Details
        </Button>
        {isRemoved ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => set.mutate({ status: "needs_attention" })}
            disabled={set.isPending}
          >
            Re-open for review
          </Button>
        ) : (
          <>
            {isConfirmed ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => set.mutate({ status: "needs_attention" })}
                disabled={set.isPending}
                title="Unconfirm this requirement (does not affect applicability scope below)"
              >
                Unconfirm requirement
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                onClick={() => set.mutate({ status: "confirmed" })}
                disabled={set.isPending}
                title="Step 1 of 2 — confirm this is a real requirement. You'll then confirm applicability scope below."
              >
                Confirm requirement
              </Button>
            )}

            <Dialog
              open={removeOpen}
              onOpenChange={(o) => {
                setRemoveOpen(o);
                if (!o) setAcknowledged(false);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-700 hover:bg-red-500/10 hover:text-red-800 dark:text-red-300"
                  disabled={set.isPending}
                >
                  Remove…
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    Remove this requirement from NECTAR?
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {isFromAuthSource
                      ? "This requirement was drafted from an authoritative source you uploaded."
                      : "This requirement is currently in NECTAR's active set."}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-900 dark:text-red-200">
                    <p className="font-semibold">"{req.title}"</p>
                    {req.source_citation && (
                      <p className="mt-0.5 opacity-80">
                        {req.source_citation}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                    <p className="mb-1 flex items-center gap-1 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      This changes what NECTAR treats as audit-ready
                    </p>
                    <p>
                      Once removed, NECTAR will no longer track or surface this
                      requirement. Your company may no longer be fully
                      state-audit-ready as a result — whether the removal is
                      accidental or intentional. The record stays on the trail
                      and is re-openable.
                    </p>
                  </div>

                  <label
                    className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/60 p-3 text-xs"
                  >
                    <Checkbox
                      checked={acknowledged}
                      onCheckedChange={(v) => setAcknowledged(v === true)}
                      className="mt-0.5"
                    />
                    <span className="text-foreground/90">
                      {REMOVE_ATTESTATION_TEXT}
                    </span>
                  </label>
                  <p className="text-[10px] text-muted-foreground">
                    Your user, the timestamp, the requirement, the source
                    document, and this exact statement will be written to the
                    immutable Attestation log.
                  </p>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRemoveOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!acknowledged || set.isPending}
                    className="bg-red-600 text-white hover:bg-red-500"
                    onClick={() => {
                      set.mutate(
                        {
                          status: "removed",
                          attestStatement: REMOVE_ATTESTATION_TEXT,
                        },
                        {
                          onSuccess: () => {
                            setRemoveOpen(false);
                            setAcknowledged(false);
                          },
                        },
                      );
                    }}
                  >
                    {set.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Confirm removal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
      </div>
      {!isRemoved && (
        <ApplicabilityPanel orgId={orgId} requirementId={req.id} />
      )}
      <RequirementDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        req={req}
        orgId={orgId}
        sourceMeta={sourceMeta ?? null}
        status={status}
        onConfirm={() => set.mutate({ status: "confirmed" })}
        onUnconfirm={() => set.mutate({ status: "needs_attention" })}
        onReopen={() => set.mutate({ status: "needs_attention" })}
        onRequestRemove={() => {
          setDetailOpen(false);
          setRemoveOpen(true);
        }}
        isMutating={set.isPending}
      />
    </li>
  );
}





function ManualRequirementDialog({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("audit_doc");
  const [citation, setCitation] = useState("");
  const upsertFn = useServerFn(upsertRequirement);
  const m = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          organizationId: orgId,
          origin: "manual",
          requirementKey: `manual:${Date.now()}`,
          title: title.trim(),
          description: description.trim() || null,
          category,
          sourceCitation: citation.trim() || null,
          appliesTo: "company",
        },
      }),
    onSuccess: () => {
      toast.success("Requirement added.");
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
      setOpen(false);
      setTitle("");
      setDescription("");
      setCitation("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Add manual requirement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a manual requirement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="audit_doc">Audit document</SelectItem>
                  <SelectItem value="obligation">Obligation</SelectItem>
                  <SelectItem value="rule">Rule</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Citation (optional)</Label>
              <Input
                value={citation}
                onChange={(e) => setCitation(e.target.value)}
                placeholder="e.g. SOW §3.1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !title.trim()}
            className="bg-amber-500 text-amber-950 hover:bg-amber-400"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Attestation log ----------

function AttestationsPanel({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listAttestations);
  const { data, isLoading } = useQuery({
    queryKey: ["attestations", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId, limit: 200 } }),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Immutable attestation log</h2>
        <Badge variant="outline" className="text-[10px]">
          {data?.attestations?.length ?? 0} entries
        </Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Every "Confirm" you click in HIVE is logged here with user, timestamp,
        and the exact statement you attested to. This log is append-only.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : (data?.attestations?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          No attestations recorded yet.
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {data!.attestations.map((a) => (
            <li key={a.id as string} className="py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">
                  {a.scope as string}
                </Badge>
                <span className="text-muted-foreground">
                  {a.user_display_name ?? "—"}
                </span>
                <span className="text-muted-foreground">
                  · {new Date(a.attested_at as string).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed">{a.statement as string}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- NECTAR Requirements Engine — applicability mapping ----------
// Per-requirement scope panel: NECTAR proposes which parts of the operation
// this requirement governs (provider-wide, by code, by role, by client);
// admin confirms or corrects. Drives audit checklists, billing readiness,
// staff app capture, and tasks downstream.

interface MappingRow {
  id: string;
  requirement_id: string;
  scope_kind: "provider" | "code" | "role" | "client" | "unknown";
  scope_value: string | null;
  cadence: string | null;
  jurisdiction: string | null;
  proposed_by: "nectar" | "admin";
  confirmed: boolean;
  confirmed_at: string | null;
  rationale: string | null;
  source_excerpt: string | null;
}

const SCOPE_LABEL: Record<MappingRow["scope_kind"], string> = {
  provider: "Provider-wide",
  code: "Service code",
  role: "Staff role",
  client: "Per client",
  unknown: "Needs review",
};

function ApplicabilityPanel({
  orgId,
  requirementId,
}: {
  orgId: string;
  requirementId: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listRequirementMappings);
  const proposeFn = useServerFn(proposeRequirementMappings);
  const setFn = useServerFn(setRequirementMapping);
  const delFn = useServerFn(deleteRequirementMapping);
  const [open, setOpen] = useState(false);
  const [addKind, setAddKind] = useState<MappingRow["scope_kind"]>("code");
  const [addValue, setAddValue] = useState("");

  const q = useQuery({
    enabled: open,
    queryKey: ["req-mappings", orgId, requirementId],
    queryFn: () =>
      listFn({ data: { organizationId: orgId, requirementId } }),
  });

  const propose = useMutation({
    mutationFn: () => proposeFn({ data: { requirementId } }),
    onSuccess: (r) => {
      toast.success(
        r.inserted > 0
          ? `NECTAR proposed ${r.inserted} scope${r.inserted === 1 ? "" : "s"}.`
          : "NECTAR couldn't confidently propose a scope — add one manually.",
      );
      qc.invalidateQueries({ queryKey: ["req-mappings", orgId, requirementId] });
      qc.invalidateQueries({ queryKey: ["req-mappings-all", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalidateMappings = () => {
    qc.invalidateQueries({ queryKey: ["req-mappings", orgId, requirementId] });
    qc.invalidateQueries({ queryKey: ["req-mappings-all", orgId] });
  };

  const confirm = useMutation({
    mutationFn: (id: string) =>
      setFn({ data: { id, confirmed: true } }),
    onSuccess: () => invalidateMappings(),
    onError: (e: Error) => toast.error(e.message),
  });
  const confirmAll = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => setFn({ data: { id, confirmed: true } })));
      return ids.length;
    },
    onSuccess: (n) => {
      invalidateMappings();
      toast.success(
        n === 1
          ? "Applicability confirmed for 1 scope."
          : `Applicability confirmed for ${n} scopes.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => invalidateMappings(),
    onError: (e: Error) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: () => {
      const k = addKind;
      const v = (k === "provider" || k === "unknown")
        ? null
        : k === "client"
          ? "*"
          : addValue.trim().toUpperCase();
      if ((k === "code" || k === "role") && !v)
        throw new Error("Enter a code or role key");
      return setFn({
        data: {
          organizationId: orgId,
          requirementId,
          scopeKind: k,
          scopeValue: v,
          confirmed: true,
          rationale: "Manually added by admin.",
        },
      });
    },
    onSuccess: () => {
      setAddValue("");
      invalidateMappings();
      toast.success("Scope added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data?.mappings ?? []) as unknown as MappingRow[];
  const hasAny = rows.length > 0;
  const confirmedCount = rows.filter((r) => r.confirmed).length;
  const pendingCount = rows.filter((r) => !r.confirmed).length;
  const unknownCount = rows.filter((r) => r.scope_kind === "unknown").length;

  return (
    <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-50/40 dark:bg-amber-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[36px] items-center justify-between gap-2 px-3 py-2 text-left text-[11px]"
      >
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-[#d97a1c]">
          <Sparkle className="h-3 w-3" /> NECTAR Applicability
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {hasAny ? (
            <>
              <span>{confirmedCount} confirmed</span>
              {pendingCount > 0 && (
                <Badge className="bg-amber-500/20 text-[10px] text-amber-900 dark:text-amber-200">
                  {pendingCount} to review
                </Badge>
              )}
              {unknownCount > 0 && (
                <Badge variant="outline" className="text-[10px] text-red-700 dark:text-red-300">
                  {unknownCount} unknown
                </Badge>
              )}
            </>
          ) : (
            <span className="italic">No scope mapped yet</span>
          )}
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-amber-500/20 px-3 py-3 text-xs">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-[#d97a1c]">Step 2 of 2.</span>{" "}
            Confirming applicability tells NECTAR <em>who or what</em> this
            requirement governs — it's what drives the audit checklist, billing
            readiness, and staff capture. A requirement isn't fully reviewed
            until at least one scope is confirmed.
          </p>

          {/* Primary bulk action — promoted out of the per-row right edge so
              "confirm scope" is obviously the next step after confirming the
              requirement above. */}
          {(() => {
            const pendingIds = rows
              .filter((r) => !r.confirmed && r.scope_kind !== "unknown")
              .map((r) => r.id);
            if (pendingIds.length === 0) return null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d97a1c]/40 bg-[#d97a1c]/10 px-3 py-2">
                <span className="text-[11px] text-[#7a4310] dark:text-amber-200">
                  NECTAR proposed{" "}
                  <span className="font-semibold">
                    {pendingIds.length} scope{pendingIds.length === 1 ? "" : "s"}
                  </span>{" "}
                  for this requirement. Confirm to apply.
                </span>
                <Button
                  size="sm"
                  className="h-8 bg-[#d97a1c] text-white hover:bg-[#b86413]"
                  disabled={confirmAll.isPending}
                  onClick={() => confirmAll.mutate(pendingIds)}
                >
                  {confirmAll.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  )}
                  Confirm applicability ({pendingIds.length})
                </Button>
              </div>
            );
          })()}

          {q.isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          )}

          {!q.isLoading && rows.length === 0 && (
            <div className="rounded-md border border-dashed border-amber-500/30 p-3 text-muted-foreground">
              No scopes proposed yet. Ask NECTAR to propose, or add one manually.
            </div>
          )}

          {rows.length > 0 && (
            <ul className="space-y-1.5">
              {rows.map((m) => (
                <li
                  key={m.id}
                  className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 ${
                    m.scope_kind === "unknown"
                      ? "border-red-500/40 bg-red-500/5"
                      : m.confirmed
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                  }`}
                >
                  <Badge variant="outline" className="text-[10px]">
                    {SCOPE_LABEL[m.scope_kind]}
                  </Badge>
                  {m.scope_value && m.scope_value !== "*" && (
                    <span className="font-mono text-[11px] font-semibold">
                      {m.scope_value}
                    </span>
                  )}
                  {m.cadence && (
                    <Badge variant="outline" className="text-[10px]">
                      {m.cadence}
                    </Badge>
                  )}
                  {m.proposed_by === "nectar" && !m.confirmed && (
                    <Badge className="bg-[#d97a1c]/15 text-[10px] text-[#d97a1c]">
                      proposed
                    </Badge>
                  )}
                  {m.confirmed && (
                    <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
                      confirmed
                    </Badge>
                  )}
                  {m.rationale && (
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {m.rationale}
                    </span>
                  )}
                  <div className="ml-auto flex gap-1">
                    {!m.confirmed && m.scope_kind !== "unknown" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={confirm.isPending}
                        onClick={() => confirm.mutate(m.id)}
                      >
                        Confirm scope
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-1.5 text-red-700 hover:bg-red-500/10 dark:text-red-300"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(m.id)}
                      aria-label="Remove scope"
                    >
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-amber-500/20 pt-3">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              disabled={propose.isPending}
              onClick={() => propose.mutate()}
            >
              {propose.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              Ask NECTAR to propose
            </Button>

            <div className="flex items-end gap-1.5">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Add scope
                </Label>
                <Select
                  value={addKind}
                  onValueChange={(v) => setAddKind(v as MappingRow["scope_kind"])}
                >
                  <SelectTrigger className="h-8 w-[140px] text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="provider">Provider-wide</SelectItem>
                    <SelectItem value="code">Service code</SelectItem>
                    <SelectItem value="role">Staff role</SelectItem>
                    <SelectItem value="client">Per client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(addKind === "code" || addKind === "role") && (
                <Input
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  placeholder={addKind === "code" ? "HHS" : "RN"}
                  className="h-8 w-24 text-[11px]"
                />
              )}
              <Button
                size="sm"
                className="h-8 text-[11px]"
                disabled={add.isPending}
                onClick={() => add.mutate()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Requirement detail pop-up (Prompt 27) ----------
// Frosted modal that surfaces full requirement text, source citation, mapping,
// and a NECTAR plain-language restatement. The original source wording stays
// primary; the NECTAR explanation is clearly secondary and clearly labeled as
// comprehension-aid only — never authoritative.
function RequirementDetailDialog({
  open,
  onOpenChange,
  req,
  orgId,
  sourceMeta,
  status,
  onConfirm,
  onUnconfirm,
  onReopen,
  onRequestRemove,
  isMutating,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  req: ReqRow;
  orgId: string;
  sourceMeta: SourceMeta | null;
  status: ReviewStatus;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onReopen: () => void;
  onRequestRemove: () => void;
  isMutating: boolean;
}) {
  const isRemoved = status === "removed";
  const isConfirmed = status === "confirmed";

  const explainFn = useServerFn(explainRequirement);
  const explain = useMutation({
    mutationFn: () => explainFn({ data: { requirementId: req.id } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const explanation = explain.data?.explanation;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-border/60 bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            {isConfirmed && (
              <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Confirmed
              </Badge>
            )}
            {status === "needs_attention" && (
              <Badge className="bg-amber-500/15 text-[10px] text-amber-800 dark:text-amber-200">
                Needs attention
              </Badge>
            )}
            {isRemoved && (
              <Badge
                variant="outline"
                className="text-[10px] text-red-700 dark:text-red-300"
              >
                Removed — not tracked for audit
              </Badge>
            )}
            {req.category && (
              <Badge variant="outline" className="text-[10px]">
                {req.category}
              </Badge>
            )}
          </div>
          <DialogTitle className="mt-1 text-base leading-snug">
            {req.title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Review the requirement in full before confirming. Confirm and remove
            actions log to the Attestation trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Source attribution — primary, authoritative */}
          <section className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <BookOpen className="h-3 w-3" /> Source
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {sourceMeta?.title ?? sourceMeta?.file_name ?? "Manual / suggestion"}
              </span>
              {sourceMeta?.fiscal_year && (
                <Badge variant="outline" className="text-[10px]">
                  FY {sourceMeta.fiscal_year}
                </Badge>
              )}
              {sourceMeta?.authoritative_kind && (
                <Badge variant="outline" className="text-[10px]">
                  {sourceMeta.authoritative_kind.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <div className="mt-2">
              <SourceCitationChip citation={req.source_citation} />
            </div>
          </section>

          {/* Original requirement text — authoritative wording */}
          <section className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Requirement text (original wording)
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {req.description?.trim() || (
                <span className="italic text-muted-foreground">
                  No extended description was extracted — the title above is the
                  full text NECTAR captured from the source.
                </span>
              )}
            </p>
            {isConfirmed && req.verified_at && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Confirmed {new Date(req.verified_at).toLocaleString()}
              </p>
            )}
          </section>

          {/* Applicability mapping (Foundation D) */}
          {!isRemoved && (
            <section>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Applicability (NECTAR Requirements Engine)
              </p>
              <ApplicabilityPanel orgId={orgId} requirementId={req.id} />
            </section>
          )}

          {/* NECTAR plain-language explanation — clearly secondary */}
          <section className="rounded-xl border border-amber-500/30 bg-amber-50/40 p-3 dark:bg-amber-500/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#d97a1c]">
                <Sparkle className="h-3 w-3" /> NECTAR — Explain this (plain language)
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={explain.isPending}
                onClick={() => explain.mutate()}
              >
                {explain.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" />
                )}
                {explanation ? "Re-explain" : "Explain in plain language"}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] italic text-amber-900/80 dark:text-amber-200/80">
              Plain-language restatement based on the source above — an aid to
              understanding, not legal or compliance advice. The original wording
              (shown above) governs. Review the source and consult counsel as
              needed before acting.
            </p>

            {!explanation && !explain.isPending && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                NECTAR can restate this requirement in plainer words. The
                original source text stays the authority — this is a reading aid
                only.
              </p>
            )}

            {explain.isPending && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> NECTAR is reading the
                source…
              </div>
            )}

            {explanation && (
              <div className="mt-2 space-y-2">
                <div className="rounded-md border border-amber-500/30 bg-background/60 p-2.5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {explanation.plain_language}
                  </p>
                </div>
                {explanation.key_terms.length > 0 && (
                  <div className="rounded-md border border-amber-500/20 bg-background/40 p-2.5">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Key terms
                    </p>
                    <ul className="space-y-1">
                      {explanation.key_terms.map((t, i) => (
                        <li key={i} className="text-[11px]">
                          <span className="font-semibold">{t.term}</span>
                          <span className="text-muted-foreground"> — {t.plain}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    Confidence: {explanation.confidence}
                  </Badge>
                  {explanation.caveat && <span>{explanation.caveat}</span>}
                </div>
                <p className="text-[10px] text-amber-900/80 dark:text-amber-200/80">
                  ↑ Review recommended. Always compare against the original
                  requirement text above.
                </p>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {isRemoved ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isMutating}
              onClick={() => {
                onReopen();
                onOpenChange(false);
              }}
            >
              Re-open for review
            </Button>
          ) : (
            <>
              {isConfirmed ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isMutating}
                  onClick={() => {
                    onUnconfirm();
                    onOpenChange(false);
                  }}
                >
                  Unconfirm requirement
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                  disabled={isMutating}
                  onClick={() => {
                    onConfirm();
                    onOpenChange(false);
                  }}
                >
                  Confirm requirement
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700 hover:bg-red-500/10 hover:text-red-800 dark:text-red-300"
                disabled={isMutating}
                onClick={onRequestRemove}
              >
                Remove…
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
