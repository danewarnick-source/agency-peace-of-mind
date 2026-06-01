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
import { AttestationBanner } from "@/components/nectar/attestation-banner";
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
} from "@/lib/authoritative-sources.functions";


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
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Foundation · Authoritative Sources
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your contracts &amp; State SOW power everything NECTAR shows
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          External authority documents only — SOW, contracts, DSPD/DHS requirement
          documents, and public-record requirements. NECTAR reads from these as the
          source of truth; every checklist item, audit requirement, and obligation
          HIVE surfaces traces back to a clause you uploaded. Items without a traced
          source are flagged{" "}
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Unverified
          </span>{" "}
          so authority is never implied. The rule: if a document is about one
          named person, it's a Company Doc; if it's a state/contract authority
          that governs many, it's an Authoritative Source. PCSPs and 1056
          budgets always route to{" "}
          <span className="font-medium">Company Docs</span> — NECTAR extracts
          the billing data (codes, rates, max units, plan dates) from a PCSP
          into the billing layer for that client, while the file itself stays
          with the client's records.
        </p>
        <p className="rounded-lg border border-dashed border-[color:var(--amber-400,#f4a93a)]/60 bg-[color:var(--amber-50,#fffbeb)]/60 px-3 py-2 text-xs text-[color:var(--amber-800,#92400e)]">
          Tip — drop a PDF, scan, Word, or spreadsheet anywhere on this page and
          NECTAR will propose a label before saving it into the source-of-truth set.
        </p>
      </header>

      {orgId && (
        <AttestationBanner
          organizationId={orgId}
          scope="generic"
          mode="nudge"
        />
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

  const statsByDoc = useMemo(() => {
    const map = new Map<
      string,
      { total: number; confirmed: number; needs: number; removed: number; lastDraftedAt: string | null }
    >();
    type Row = { source_document_id: string | null; review_status: string | null; verified: boolean | null; created_at: string | null };
    const rows = ((reqData?.requirements ?? []) as unknown) as Row[];
    for (const r of rows) {
      if (!r.source_document_id) continue;
      const cur = map.get(r.source_document_id) ?? {
        total: 0,
        confirmed: 0,
        needs: 0,
        removed: 0,
        lastDraftedAt: null as string | null,
      };
      cur.total += 1;
      const s = r.review_status ?? (r.verified ? "confirmed" : "needs_attention");
      if (s === "confirmed") cur.confirmed += 1;
      else if (s === "removed") cur.removed += 1;
      else cur.needs += 1;
      if (r.created_at && (!cur.lastDraftedAt || r.created_at > cur.lastDraftedAt)) {
        cur.lastDraftedAt = r.created_at;
      }
      map.set(r.source_document_id, cur);
    }
    return map;
  }, [reqData]);

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
    | { total: number; confirmed: number; needs: number; removed: number; lastDraftedAt: string | null }
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
              · {stats!.confirmed} confirmed
            </span>
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

      <AttestationBanner
        organizationId={orgId}
        scope="generic"
        mode="nudge"
        compact
        statement="Items below are organized by NECTAR from documents you uploaded. Confirm, remove, and re-open actions are logged to the immutable attestation log — together they form your defensible 'we reviewed our requirements' record."
      />

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
}: {
  group: ReqGroup;
  orgId: string;
}) {
  const counts = useMemo(() => {
    let confirmed = 0;
    let needs = 0;
    let removed = 0;
    for (const i of group.items) {
      const s = statusOf(i);
      if (s === "confirmed") confirmed += 1;
      else if (s === "removed") removed += 1;
      else needs += 1;
    }
    return { total: group.items.length, confirmed, needs, removed };
  }, [group.items]);

  // Default: expand if there's anything still needing attention.
  const [open, setOpen] = useState(counts.needs > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-background/60 backdrop-blur">
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
            {counts.confirmed} confirmed
          </Badge>
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
            <RequirementRow key={r.id} req={r} orgId={orgId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RequirementRow({
  req,
  orgId,
}: {
  req: ReqRow;
  orgId: string;
}) {
  const qc = useQueryClient();
  const setStatusFn = useServerFn(setRequirementReviewStatus);
  const set = useMutation({
    mutationFn: (status: ReviewStatus) =>
      setStatusFn({ data: { id: req.id, status } }),
    onSuccess: (_d, status) => {
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
      qc.invalidateQueries({ queryKey: ["attestations", orgId] });
      if (status === "confirmed") toast.success("Confirmed.");
      else if (status === "removed")
        toast.message("Removed from active use", {
          description:
            "NECTAR will stop pulling from this requirement. Record kept for the trail.",
        });
      else toast.message("Re-opened for review.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = statusOf(req);
  const isRemoved = status === "removed";
  const isConfirmed = status === "confirmed";

  return (
    <li
      className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between ${isRemoved ? "opacity-55" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-sm font-medium ${isRemoved ? "line-through decoration-muted-foreground/60" : ""}`}
          >
            {req.title}
          </span>
          {req.category && (
            <Badge variant="outline" className="text-[10px]">
              {req.category}
            </Badge>
          )}
          <SourceCitationChip citation={req.source_citation} />
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
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Removed — not in active use
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
      <div className="flex flex-wrap gap-2">
        {isRemoved ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => set.mutate("needs_attention")}
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
                onClick={() => set.mutate("needs_attention")}
                disabled={set.isPending}
              >
                Unconfirm
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                onClick={() => set.mutate("confirmed")}
                disabled={set.isPending}
              >
                Confirm
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => set.mutate("removed")}
              disabled={set.isPending}
            >
              Remove
            </Button>
          </>
        )}
      </div>
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
