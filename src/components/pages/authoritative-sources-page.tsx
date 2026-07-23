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
import { CodeActivationBanner } from "@/components/nectar/code-activation-banner";
import { RequirementCard } from "@/components/nectar/requirement-card";
import { ComplianceRulesPanel } from "@/components/nectar/compliance-rules-panel";
import { HeldTimesheetsPanel, HeldTimesheetsBadge } from "@/components/nectar/held-timesheets-panel";
import { activateCodeRequirements } from "@/lib/nectar-requirement-usage.functions";
import { supabase } from "@/integrations/supabase/client";
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
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";
import { NectarFocusBanner } from "@/components/nectar/nectar-focus-banner";
import { ingestDocument } from "@/lib/nectar-documents.functions";
import {
  listAuthoritativeSources,
  markAsAuthoritativeSource,
  listRequirements,
  startRequirementsDraft,
  upsertRequirement,

  setRequirementReviewStatus,
  setSourceIgnoreState,
  listAttestations,
  ingestWebSource,
  explainRequirement,
  updatePolicyConfig,
} from "@/lib/authoritative-sources.functions";
import {
  listPolicySignatureStatus,
  supersedePolicyVersion,
} from "@/lib/policy-signatures.functions";
import { AssignModal } from "@/components/forms/assign-modal";
import { Switch } from "@/components/ui/switch";
import {
  useDraftJobProgress,
  formatEta,
} from "@/components/nectar/draft-jobs-driver";
import {
  proposeRequirementMappings,
  listRequirementMappings,
  setRequirementMapping,
  deleteRequirementMapping,
  prefillRequirementMappings,
  confirmRequirementWithScopes,
} from "@/lib/nectar-engine.functions";
import { Sparkle, X as XIcon, Hexagon } from "lucide-react";
import { AuthorizedCodesPanel } from "@/components/nectar/authorized-codes-panel";
import { ExternalLink as ExternalLinkIcon, Building } from "lucide-react";
import { attestExternalCompletion, inferClassification } from "@/lib/external-compliance.functions";
import { Textarea } from "@/components/ui/textarea";
import {
  computeRequirementDueState,
  frequencyLabel,
  type RequirementTracking,
} from "@/lib/requirement-tracking";
import { RequirementTrackingEditor } from "@/components/nectar/requirement-tracking-editor";
import {
  listProviderPendingConfirmations,
  providerConfirmRequirement,
  providerRejectRequirement,
} from "@/lib/nectar-approvals.functions";




const AUTH_KINDS = [
  { value: "state_sow", label: "State Scope of Work (SOW)" },
  { value: "provider_contract", label: "Provider contract" },
  { value: "dspd_requirement", label: "DSPD requirement doc" },
  { value: "dhs_requirement", label: "DHS requirement doc" },
  { value: "public_record", label: "Other public-record requirement" },
  { value: "tool_template", label: "Tool / Template (review, audit, scoring form)" },
  { value: "provider_policy", label: "Provider policy / procedure" },
  { value: "other", label: "Other" },
];

// Kinds NECTAR will NOT draft state-compliance requirements from —
// tools/templates describe HOW someone reviews compliance, not WHAT the
// provider must do; provider policies get their own "what must staff
// know/do" summarization task instead (see SourceRow's PolicyConfigPanel).
const NON_OBLIGATION_KINDS = new Set<string>(["tool_template", "provider_policy"]);

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

export function AuthoritativeSourcesPage() {
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
      <OnboardingReturnBar />
      <OnboardingGuidanceBanner step={1} />
      <NectarFocusBanner />
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

      {orgId && <CodeActivationBanner organizationId={orgId} />}



      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 rounded-2xl border border-border/60 bg-background/60 p-1 backdrop-blur">
          <TabsTrigger value="sources" className="gap-1">
            <BookOpen className="h-3.5 w-3.5" /> Sources
          </TabsTrigger>
          <TabsTrigger value="requirements" className="gap-1">
            <FileCheck className="h-3.5 w-3.5" /> Requirements
          </TabsTrigger>
          <TabsTrigger value="codes" className="gap-1">
            <Hexagon className="h-3.5 w-3.5" /> Authorized codes
          </TabsTrigger>
          <TabsTrigger value="attestations" className="gap-1">
            <ScrollText className="h-3.5 w-3.5" /> Attestation log
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1">
            <ScrollText className="h-3.5 w-3.5" /> Compliance rules
          </TabsTrigger>
          <TabsTrigger value="held" className="gap-1">
            <ScrollText className="h-3.5 w-3.5" /> Held timesheets
            <HeldTimesheetsBadge organizationId={orgId ?? undefined} />
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
        <TabsContent value="codes">
          {orgId ? <AuthorizedCodesPanel orgId={orgId} /> : <LoadingCard />}
        </TabsContent>
        <TabsContent value="attestations">
          {orgId ? <AttestationsPanel orgId={orgId} /> : <LoadingCard />}
        </TabsContent>
        <TabsContent value="rules">
          {orgId ? <ComplianceRulesPanel organizationId={orgId} /> : <LoadingCard />}
        </TabsContent>
        <TabsContent value="held">
          {orgId ? <HeldTimesheetsPanel organizationId={orgId} /> : <LoadingCard />}
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
  const { data: org } = useCurrentOrg();
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
        notApplicable: number;
        lastDraftedAt: string | null;
      }
    >();
    type Row = {
      id: string;
      origin: string;
      source_document_id: string | null;
      review_status: string | null;
      verified: boolean | null;
      created_at: string | null;
      scope_state?: "in_scope" | "out_of_scope" | null;
    };
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
        notApplicable: 0,
        lastDraftedAt: null as string | null,
      };
      cur.total += 1;
      const s = r.review_status ?? (r.verified ? "confirmed" : "needs_attention");
      // Precedence: removed > not_applicable (auto) > confirmed/needs_attention.
      if (s === "removed") {
        cur.removed += 1;
      } else if (r.scope_state === "out_of_scope") {
        cur.notApplicable += 1;
      } else if (s === "confirmed") {
        cur.confirmed += 1;
        if (isScopeReady(applicByReq.get(r.id))) cur.fullyConfirmed += 1;
        else cur.scopePending += 1;
      } else {
        cur.needs += 1;
      }
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
            {(data!.sources as Array<Record<string, unknown>>).map((s) => (
              <SourceRow
                key={s.id as string}
                source={s as never}
                orgId={orgId}
                stats={statsByDoc.get(s.id as string) ?? null}
                allSources={data!.sources as Array<{ id: string; title: string; metadata?: Record<string, unknown> | null }>}
                onJumpToRequirements={onJumpToRequirements}
                currentRole={org?.role ?? null}
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
  allSources,
  onJumpToRequirements,
  currentRole,
}: {
  source: { id: string; title: string; authoritative_kind: string | null; is_authoritative_source?: boolean | null; fiscal_year: string | null; effective_start: string | null; effective_end: string | null; file_name: string; uploaded_by_name: string | null; created_at: string; parse_status: string | null; metadata?: Record<string, unknown> | null; version?: number | null };
  orgId: string;
  stats:
    | {
        total: number;
        confirmed: number;
        fullyConfirmed: number;
        scopePending: number;
        needs: number;
        removed: number;
        notApplicable: number;
        lastDraftedAt: string | null;
      }
    | null;

  allSources: Array<{ id: string; title: string; metadata?: Record<string, unknown> | null }>;
  onJumpToRequirements: (docId: string) => void;
  currentRole?: string | null;
}) {
  const canDraft = currentRole === "admin" || currentRole === "manager" || currentRole === "super_admin";

  const meta = (source.metadata ?? {}) as {
    ignored?: boolean;
    ignored_as?: "ignore" | "duplicate";
    ignored_at?: string;
    ignored_by_name?: string;
    ignored_reason?: string;
    duplicate_of_id?: string;
    duplicate_of_title?: string;
  };
  const isIgnored = !!meta.ignored;
  const kind = source.authoritative_kind ?? "other";
  const isNonObligation = NON_OBLIGATION_KINDS.has(kind);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoreMode, setIgnoreMode] = useState<"ignore" | "duplicate">("ignore");

  const ignoreFn = useServerFn(setSourceIgnoreState);
  const ignoreMutation = useMutation({
    mutationFn: (vars: { action: "ignore" | "duplicate" | "reactivate"; reason?: string; duplicateOfId?: string; existingRequirementsChoice?: "keep_active" | "leave_as_is" | "none" }) =>
      ignoreFn({
        data: {
          documentId: source.id,
          action: vars.action,
          reason: vars.reason ?? null,
          duplicateOfId: vars.duplicateOfId ?? null,
          existingRequirementsChoice: vars.existingRequirementsChoice ?? "none",
        },
      }),
    onSuccess: (_r, vars) => {
      toast.success(
        vars.action === "reactivate"
          ? "Source reactivated — NECTAR will draft from it again."
          : vars.action === "duplicate"
            ? "Marked as duplicate and set aside."
            : "Source set aside.",
      );
      qc.invalidateQueries({ queryKey: ["auth-sources", orgId] });
      qc.invalidateQueries({ queryKey: ["attestations", orgId] });
      setIgnoreOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const qc = useQueryClient();
  const startFn = useServerFn(startRequirementsDraft);
  const markFn = useServerFn(markAsAuthoritativeSource);
  const markMutation = useMutation({
    mutationFn: (nextKind: string) =>
      markFn({
        data: {
          documentId: source.id,
          authoritativeKind: nextKind as "state_sow" | "provider_contract" | "dspd_requirement" | "dhs_requirement" | "public_record" | "tool_template" | "provider_policy" | "other",
          isAuthoritative: true,
        },
      }),
    onSuccess: () => {
      toast.success("Document kind set — NECTAR can now draft from it.");
      qc.invalidateQueries({ queryKey: ["auth-sources", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const driverProgress = useDraftJobProgress(source.id);
  const kindMissing = !source.authoritative_kind;
  const startDraft = () => {
    if (kindMissing) {
      toast.warning("Pick a document kind first so NECTAR knows how to read it.");
      return;
    }
    generate.mutate();
  };
  const generate = useMutation({
    mutationFn: async () => {
      const start = await startFn({ data: { documentId: source.id } });
      return start;
    },
    onSuccess: (r) => {
      // Early-exit reasons (no_text / non_obligation_kind) come back with
      // jobId === null — surface immediately, no background work started.
      const start = r as { jobId: string | null; reason?: string; message?: string };
      if (!start.jobId) {
        if (start.reason === "policy_summary_done") {
          toast.success(start.message ?? "Policy summarized.", { duration: 7000 });
          // Refresh metadata.policy_summary onto this row.
          qc.invalidateQueries({ queryKey: ["auth-sources", orgId] });
          return;
        }
        toast.warning(
          start.message ??
            "NECTAR read the document but didn't find clear requirement language.",
          { duration: 9000 },
        );
        return;
      }
      // The global DraftJobsProvider will pick this job up on its next poll
      // and drive it to completion — even across page navigation.
      qc.invalidateQueries({ queryKey: ["nectar-draft-jobs", orgId] });
      const total = (r as { totalChunks?: number }).totalChunks ?? 0;
      toast.info(
        total > 0
          ? `NECTAR started reading "${source.title}" — ${total} section${total === 1 ? "" : "s"}. Progress saves after every section, so it's safe to leave the page.`
          : "Drafting started. NECTAR will keep working in the background.",
        { duration: 7000 },
      );
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  // Effective "in progress" state combines the initial start-request
  // roundtrip with any live driver progress for this document.
  const isDrafting = generate.isPending || driverProgress !== null;
  const progress = driverProgress?.progressPct ?? (generate.isPending ? 2 : 0);
  const etaLabel = driverProgress ? formatEta(driverProgress.etaMs) : "";
  const draftingLabel = driverProgress
    ? driverProgress.finalizing
      ? `Finalizing ${driverProgress.totalChunks} sections…`
      : `Reading section ${Math.min(
          driverProgress.processedChunks + 1,
          driverProgress.totalChunks,
        )} of ${driverProgress.totalChunks}…${etaLabel ? ` · ${etaLabel}` : ""}`
    : `Starting…`;





  const hasDraft = !!stats && stats.total > 0;

  return (
    <li className={`flex flex-col gap-2 py-3 ${hasDraft ? "" : "sm:flex-row sm:items-start sm:justify-between"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-words text-sm font-medium">{source.title}</span>
          {kindMissing ? (
            <Select
              value=""
              onValueChange={(v) => markMutation.mutate(v)}
              disabled={markMutation.isPending || !canDraft}
            >
              <SelectTrigger className="h-6 w-auto gap-1 border-dashed border-amber-500/50 bg-amber-500/5 px-2 py-0 text-[10px] text-amber-900 dark:text-amber-200">
                <SelectValue placeholder={markMutation.isPending ? "Saving…" : "Set kind"} />
              </SelectTrigger>
              <SelectContent>
                {AUTH_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value} className="text-xs">
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              {KIND_LABEL[source.authoritative_kind ?? "other"] ?? "Source"}
            </Badge>
          )}
          {source.parse_status === "parsed" && (
            <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
              Parsed
            </Badge>
          )}
          {source.parse_status === "parsing" && (
            <>
              <Badge className="bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-300">
                Parsing…
              </Badge>
              <button
                type="button"
                onClick={() => qc.invalidateQueries({ queryKey: ["auth-sources", orgId] })}
                className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                title="Refresh status — parse runs in the background"
              >
                Refresh
              </button>
            </>
          )}
          {source.parse_status === "failed" && (
            <Badge className="bg-red-500/15 text-[10px] text-red-700 dark:text-red-300">
              Parse failed
            </Badge>
          )}
          {source.parse_status === "skipped" && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Parse skipped
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="min-w-0 break-all">File: {source.file_name}</span>
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
        {source.parse_status === "failed" && (
          <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">
            {(source.metadata as { parse_error?: string } | null)?.parse_error ??
              "Parse failed. Re-upload the document to try again."}
          </p>
        )}
      </div>


      {hasDraft ? (
        <div className="flex flex-col items-stretch gap-1.5 sm:min-w-0 sm:max-w-full sm:shrink-0 sm:basis-auto sm:items-end lg:max-w-[55%]">

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
            {stats!.notApplicable > 0 && (
              <span
                className="text-muted-foreground"
                title="Auto set aside — tied to service codes this org isn't authorized for. Reversible when authorization changes."
              >
                · {stats!.notApplicable} not applicable
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
            onClick={startDraft}
            disabled={isDrafting || source.parse_status !== "parsed" || !canDraft}
            title={
              !canDraft
                ? "Drafting requirements is an Admin View action. Switch to this company's Admin View with an Admin, Manager, or Super Admin role to re-draft."
                : "Re-draft from this document (e.g. after a re-parse). Existing items are kept; new ones are added."
            }
            className="h-7 px-2 text-[11px]"
          >
            {isDrafting ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin text-[color:var(--amber-600,#d97706)]" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            {isDrafting ? draftingLabel : "Re-draft"}
          </Button>

        </div>
      ) : (
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <Button
            size="sm"
            variant="outline"
            onClick={startDraft}
            disabled={isDrafting || source.parse_status !== "parsed" || !canDraft}
            title={
              !canDraft
                ? "Drafting requirements is an Admin View action. Switch to this company's Admin View with an Admin, Manager, or Super Admin role to draft from authoritative sources."
                : source.parse_status === "parsed"
                  ? "Use NECTAR to draft checklist items from clauses found in this document"
                  : "Parsing must finish before requirements can be drafted"
            }
            className={
              isDrafting
                ? "border-[color:var(--amber-500,#f4a93a)]/60 bg-[color:var(--amber-50,#fffbeb)] text-[color:var(--amber-900,#78350f)] hover:bg-[color:var(--amber-100,#fef3c7)]"
                : undefined
            }
          >
            {isDrafting ? (
              <Sparkles className="mr-1 h-3.5 w-3.5 animate-pulse text-[color:var(--amber-600,#d97706)]" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            {isDrafting ? draftingLabel : kind === "provider_policy" ? "Summarize policy" : "Draft requirements"}
          </Button>

          {isDrafting && (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--amber-100,#fef3c7)] sm:w-44"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label="NECTAR drafting progress"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[color:var(--amber-400,#f6b94d)] to-[color:var(--amber-600,#d97706)] transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {kind === "provider_policy" && (
        <div className="mt-2 w-full basis-full">
          <PolicyPanel
            orgId={orgId}
            documentId={source.id}
            documentTitle={source.title}
            version={source.version ?? 1}
            metadata={source.metadata ?? {}}
            canEdit={canDraft}
          />
        </div>
      )}
    </li>
  );
}

// ---------- Provider-policy config, summary, and signatures ----------

type PolicyMeta = {
  policy_summary?: string[];
  policy_summary_at?: string;
};

function PolicyPanel({
  orgId,
  documentId,
  documentTitle,
  version,
  metadata,
  canEdit,
}: {
  orgId: string;
  documentId: string;
  documentTitle: string;
  version: number;
  metadata: Record<string, unknown>;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [tab, setTab] = useState<"config" | "signatures">("config");

  // Live doc row for the four config columns (not present on the list
  // payload's typed shape above, so read directly).
  const { data: docRow } = useQuery({
    queryKey: ["policy-doc-config", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nectar_documents")
        .select(
          "requires_acknowledgment, policy_assigned_groups, policy_assigned_users, policy_ack_cadence, gate_app_access",
        )
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        requires_acknowledgment: boolean;
        policy_assigned_groups: string[];
        policy_assigned_users: string[];
        policy_ack_cadence: "one_time" | "annual" | "every_2_years";
        gate_app_access: boolean;
      } | null;
    },
  });

  const requiresAck = docRow?.requires_acknowledgment ?? false;
  const groups = docRow?.policy_assigned_groups ?? [];
  const users = docRow?.policy_assigned_users ?? [];
  const cadence = docRow?.policy_ack_cadence ?? "one_time";
  const gate = docRow?.gate_app_access ?? false;

  const updateFn = useServerFn(updatePolicyConfig);
  const saveConfig = useMutation({
    mutationFn: (patch: {
      requiresAcknowledgment?: boolean;
      policyAssignedGroups?: string[];
      policyAssignedUsers?: string[];
      policyAckCadence?: "one_time" | "annual" | "every_2_years";
      gateAppAccess?: boolean;
    }) =>
      updateFn({
        data: {
          documentId,
          requiresAcknowledgment: patch.requiresAcknowledgment ?? requiresAck,
          policyAssignedGroups: patch.policyAssignedGroups ?? groups,
          policyAssignedUsers: patch.policyAssignedUsers ?? users,
          policyAckCadence: patch.policyAckCadence ?? cadence,
          gateAppAccess: patch.gateAppAccess ?? gate,
        },
      }),
    onSuccess: () => {
      toast.success("Policy settings saved.");
      qc.invalidateQueries({ queryKey: ["policy-doc-config", documentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meta = (metadata ?? {}) as PolicyMeta;
  const bullets = meta.policy_summary ?? [];

  const audienceLabel =
    users.length === 0 && groups.length === 0
      ? "No one assigned yet"
      : groups.includes("all_staff")
        ? "All staff"
        : `${groups.length} group${groups.length === 1 ? "" : "s"}, ${users.length} individual${users.length === 1 ? "" : "s"}`;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("config")}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${tab === "config" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          Acknowledgment settings
        </button>
        <button
          type="button"
          onClick={() => setTab("signatures")}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${tab === "signatures" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          Signatures
        </button>
      </div>

      {tab === "config" && (
        <div className="space-y-3">
          {bullets.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-background/70 p-2.5">
              <p className="mb-1 text-[11px] font-semibold text-foreground">
                What staff must know / do
              </p>
              <ul className="ml-4 list-disc space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium">Requires staff acknowledgment</span>
            <Switch
              checked={requiresAck}
              disabled={!canEdit || saveConfig.isPending}
              onCheckedChange={(v) => saveConfig.mutate({ requiresAcknowledgment: v })}
            />
          </label>

          {requiresAck && (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span>
                  Who must acknowledge: <span className="text-muted-foreground">{audienceLabel}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={!canEdit}
                  onClick={() => setAssignOpen(true)}
                >
                  Assign…
                </Button>
              </div>
              <AssignModal
                open={assignOpen}
                onOpenChange={setAssignOpen}
                groups={groups}
                users={users}
                allClients={false}
                clients={[]}
                onChange={(g, u) =>
                  saveConfig.mutate({ policyAssignedGroups: g, policyAssignedUsers: u })
                }
              />

              <div className="space-y-1">
                <Label className="text-[11px]">Re-acknowledgment cadence</Label>
                <Select
                  value={cadence}
                  disabled={!canEdit || saveConfig.isPending}
                  onValueChange={(v) =>
                    saveConfig.mutate({ policyAckCadence: v as "one_time" | "annual" | "every_2_years" })
                  }
                >
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time" className="text-xs">One time</SelectItem>
                    <SelectItem value="annual" className="text-xs">Annual</SelectItem>
                    <SelectItem value="every_2_years" className="text-xs">Every 2 years</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">Gate app access until signed</span>
                <Switch
                  checked={gate}
                  disabled={!canEdit || saveConfig.isPending}
                  onCheckedChange={(v) => saveConfig.mutate({ gateAppAccess: v })}
                />
              </label>
              {gate && (
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  In-scope staff will see a full-screen sign-first interstitial the next time they
                  log in or navigate — never mid-shift on an already-open session.
                </p>
              )}
            </>
          )}

          <PolicyVersionUpload orgId={orgId} oldDocumentId={documentId} documentTitle={documentTitle} version={version} canEdit={canEdit} />
        </div>
      )}

      {tab === "signatures" && (
        <PolicySignaturesTab documentId={documentId} requiresAck={requiresAck} />
      )}
    </div>
  );
}

function PolicyVersionUpload({
  orgId,
  oldDocumentId,
  documentTitle,
  version,
  canEdit,
}: {
  orgId: string;
  oldDocumentId: string;
  documentTitle: string;
  version: number;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [requireReAck, setRequireReAck] = useState(true);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const ingestFn = useServerFn(ingestDocument);
  const markFn = useServerFn(markAsAuthoritativeSource);
  const supersedeFn = useServerFn(supersedePolicyVersion);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a replacement file");
      const base64 = await fileToBase64(file);
      const r = await ingestFn({
        data: {
          organizationId: orgId,
          ownerKind: "company",
          documentType: "other",
          title: documentTitle,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileBase64: base64,
          tags: ["authoritative-source", "provider_policy"],
          autoParse: true,
        },
      });
      const doc = (r as { document?: { id?: string } }).document;
      if (!doc?.id) throw new Error("Upload failed");
      await markFn({
        data: { documentId: doc.id, authoritativeKind: "provider_policy", isAuthoritative: true },
      });
      await supersedeFn({
        data: { oldDocumentId, newDocumentId: doc.id, requireReAcknowledgment: requireReAck },
      });
      return doc.id;
    },
    onSuccess: () => {
      toast.success(
        requireReAck
          ? "New version uploaded — staff will be asked to re-acknowledge."
          : "New version uploaded.",
      );
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      qc.invalidateQueries({ queryKey: ["auth-sources", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-border/60 p-2.5">
      <p className="text-[11px] font-semibold">Upload new version (current: v{version})</p>
      <Input
        ref={fileInput}
        type="file"
        accept=".pdf,.txt,.md,.html,.htm,application/pdf,text/*"
        disabled={!canEdit || upload.isPending}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="h-8 text-xs"
      />
      <label className="flex items-start gap-2 text-[11px]">
        <Checkbox
          checked={requireReAck}
          onCheckedChange={(v) => setRequireReAck(v === true)}
          disabled={!canEdit || upload.isPending}
        />
        <span>Require re-acknowledgment of new version (resets pending status for all required staff)</span>
      </label>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[11px]"
        disabled={!canEdit || !file || upload.isPending}
        onClick={() => upload.mutate()}
      >
        {upload.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
        {upload.isPending ? "Uploading…" : "Upload as new version"}
      </Button>
    </div>
  );
}

function PolicySignaturesTab({ documentId, requiresAck }: { documentId: string; requiresAck: boolean }) {
  const fetchFn = useServerFn(listPolicySignatureStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["policy-signature-status", documentId],
    queryFn: () => fetchFn({ data: { documentId } }),
    enabled: requiresAck,
  });

  if (!requiresAck) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Turn on "Requires staff acknowledgment" to track signatures.
      </p>
    );
  }
  if (isLoading) {
    return <p className="text-[11px] text-muted-foreground">Loading…</p>;
  }
  const staff = data?.staff ?? [];
  if (staff.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No staff assigned yet — use "Assign…" in Acknowledgment settings.
      </p>
    );
  }
  const signedCount = staff.filter((s) => s.signed).length;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">
        {signedCount} of {staff.length} signed
      </p>
      <ul className="divide-y divide-border/40">
        {staff.map((s) => (
          <li key={s.userId} className="flex items-center justify-between gap-2 py-1.5 text-xs">
            <span className="min-w-0 truncate">{s.fullName ?? s.email ?? s.userId}</span>
            {s.signed ? (
              <span className="shrink-0 text-[10px] text-emerald-700 dark:text-emerald-300">
                Signed {s.signedAt ? new Date(s.signedAt).toLocaleDateString() : ""}
              </span>
            ) : (
              <span className="shrink-0 text-[10px] text-amber-700 dark:text-amber-300">Pending</span>
            )}
          </li>
        ))}
      </ul>
    </div>
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
  const [assistedSetup, setAssistedSetup] = useState(false);
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
    setAssistedSetup(false);
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
          authoritativeKind: kind as "state_sow" | "provider_contract" | "dspd_requirement" | "dhs_requirement" | "public_record" | "provider_policy" | "other",
          isAuthoritative: true,
          assistedSetup,
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
            | "provider_policy"
            | "other",
          fiscalYear: fiscalYear || null,
          effectiveStart: effectiveStart || null,
          effectiveEnd: effectiveEnd || null,
          assistedSetup,
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
              value={fiscalYear ?? ""}
              onChange={(e) => setFiscalYear(e.target.value)}
              placeholder="FY26"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Effective start</Label>
            <Input
              type="date"
              value={effectiveStart ?? ""}
              onChange={(e) => setEffectiveStart(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Effective end (optional)</Label>
          <Input
            type="date"
            value={effectiveEnd ?? ""}
            onChange={(e) => setEffectiveEnd(e.target.value)}
          />
        </div>


        <label className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <Checkbox
            checked={assistedSetup}
            onCheckedChange={(v) => setAssistedSetup(v === true)}
            className="mt-0.5 shrink-0"
          />
          <span className="flex-1">
            <strong className="block text-foreground">Request HIVE-assisted setup</strong>
            NECTAR drafts the requirements, then a HIVE Executive verifies the
            extraction is faithful to this source before it lands in your queue
            for final confirmation. Leave unchecked to self-serve as normal.
          </span>
        </label>


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
// Effective bucket combining the persisted ReviewStatus with the derived,
// reversible "auto set aside for out-of-scope service codes" state.
// Precedence: removed > not_applicable > confirmed/needs_attention.
type EffectiveStatus = ReviewStatus | "not_applicable";

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
  metadata?: Record<string, unknown> | null;
  // Derived server-side from provider_authorized_codes; only meaningful for
  // origin === "document". Reversible on every read.
  scope_state?: "in_scope" | "out_of_scope" | null;
  out_of_scope_codes?: string[] | null;
  service_code?: string | null;
  service_codes_all?: string[] | null;
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

// Effective bucket: manual removal always wins so its audit trail is never
// masked by auto scope filtering. Out-of-scope is a distinct, reversible
// state — nothing is deleted.
function effectiveStatusOf(r: ReqRow): EffectiveStatus {
  const s = statusOf(r);
  if (s === "removed") return "removed";
  if (r.scope_state === "out_of_scope") return "not_applicable";
  return s;
}

function isOutOfScope(r: ReqRow): boolean {
  return r.scope_state === "out_of_scope" && statusOf(r) !== "removed";
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

// ---------- Requirements panel (rebuilt) ----------
//
// Layout: per source (collapsible) → per obligation category (collapsible) →
// RequirementCard for each item. Billing-code requirements are grouped by
// service code with an activation header (Inactive / Pending / Active).
// No confirm-to-activate gating: `activation_state` drives enforcement,
// `confirmed_optional` is a non-blocking marker on each card.

const OBLIGATION_ORDER: Array<{
  key: string;
  label: string;
}> = [
  { key: "admin_internal", label: "Administrative — Internal" },
  { key: "admin_external", label: "Administrative — External (DWS, DACS, etc.)" },
  { key: "client", label: "Client-specific" },
  { key: "staff", label: "Staff/Employee-specific" },
  { key: "provider_wide", label: "Provider-wide" },
  { key: "billing_code", label: "Billing-code-specific" },
];

const KIND_LABEL_SHORT: Record<string, string> = {
  state_sow: "State SOW",
  state_contract: "State contract",
  state_rule: "State rule",
  dspd_manual: "DSPD/DHS manual",
  policy: "Policy",
  guidance: "Guidance",
};

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

  // Held codes drive Inactive vs. Pending/Active labeling for billing-code
  // sub-sections. Non-held codes stay VIEWABLE (knowledge, not enforcement).
  const { data: heldCodes } = useQuery({
    queryKey: ["auth-codes-held", orgId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("provider_authorized_codes")
        .select("code, archived_at")
        .eq("organization_id", orgId);
      if (error) throw error;
      return new Set<string>(
        (rows ?? [])
          .filter((r) => (r as { archived_at: string | null }).archived_at == null)
          .map((r) => String((r as { code: string }).code).toUpperCase()),
      );
    },
  });

  // Latest confirmation per code — for the "Active since X by Y" line.
  const { data: activations } = useQuery({
    queryKey: ["code-activations", orgId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("nectar_code_activations" as any)
        .select("service_code, confirmed_at, confirmed_by, deactivated_at")
        .eq("organization_id", orgId)
        .is("deactivated_at", null);
      if (error) throw error;
      const m = new Map<string, { confirmed_at: string; confirmed_by: string }>();
      for (const r of ((rows ?? []) as unknown) as Array<{
        service_code: string;
        confirmed_at: string;
        confirmed_by: string;
      }>) {
        m.set(r.service_code, { confirmed_at: r.confirmed_at, confirmed_by: r.confirmed_by });
      }
      return m;
    },
  });

  const grouped = useMemo(() => {
    const rows = ((data?.requirements ?? []) as unknown) as Array<
      ReqRow & {
        obligation_category: string | null;
        obligation_category_source: "nectar" | "provider" | null;
        activation_state: string;
        confirmed_optional: boolean;
        original_title: string | null;
        original_description: string | null;
        original_source_citation: string | null;
      }
    >;
    const sourcesById = (data?.sourcesById ?? {}) as Record<string, SourceMeta>;
    // Bucket: source_id → category → (billing_code sub: service_code) → rows
    const bySource = new Map<string, typeof rows>();
    for (const r of rows) {
      const sid = r.source_document_id ?? "__no_source";
      const arr = bySource.get(sid) ?? [];
      arr.push(r);
      bySource.set(sid, arr);
    }
    return Array.from(bySource.entries()).map(([sid, items]) => {
      const src = sid === "__no_source" ? null : sourcesById[sid] ?? null;
      const byCat = new Map<string, typeof items>();
      for (const r of items) {
        const cat = r.obligation_category ?? "provider_wide";
        const arr = byCat.get(cat) ?? [];
        arr.push(r);
        byCat.set(cat, arr);
      }
      return { sid, src, byCat, total: items.length };
    });
  }, [data]);

  const containerRef = useRef<HTMLDivElement | null>(null);
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
          <h2 className="text-sm font-semibold">Requirements</h2>
          <p className="text-xs text-muted-foreground">
            Original wording is immutable. Edit the usage note to shape how
            NECTAR applies each requirement — every edit is logged with your
            name and timestamp. Confirmation is optional; requirements
            govern by activation state.
          </p>
        </div>
        <ManualRequirementDialog orgId={orgId} />
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      )}

      {!isLoading && grouped.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-background/60 p-8 text-center text-sm text-muted-foreground">
          No requirements yet. Upload a SOW or contract above, then run
          "Draft requirements" on it — or add one by hand.
        </div>
      )}

      {grouped.map((g) => (
        <SourceRequirementsBlock
          key={g.sid}
          orgId={orgId}
          sourceId={g.sid}
          source={g.src}
          byCat={g.byCat}
          total={g.total}
          heldCodes={heldCodes ?? new Set()}
          activations={activations ?? new Map()}
          forceOpen={focusDocumentId === g.sid}
          highlight={highlightKey === g.sid}
        />
      ))}
    </div>
  );
}

type RequirementCategoryRow = ReqRow & {
  obligation_category: string | null;
  obligation_category_source: "nectar" | "provider" | null;
  activation_state: string;
  confirmed_optional: boolean;
  original_title: string | null;
  original_description: string | null;
  original_source_citation: string | null;
};

function SourceRequirementsBlock({
  orgId,
  sourceId,
  source,
  byCat,
  total,
  heldCodes,
  activations,
  forceOpen,
  highlight,
}: {
  orgId: string;
  sourceId: string;
  source: SourceMeta | null;
  byCat: Map<string, RequirementCategoryRow[]>;
  total: number;
  heldCodes: Set<string>;
  activations: Map<string, { confirmed_at: string; confirmed_by: string }>;
  forceOpen: boolean;
  highlight: boolean;
}) {
  const [open, setOpen] = useState<boolean>(forceOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const title =
    source?.title ??
    (sourceId === "__no_source" ? "Manual / Suggested requirements" : "Source");
  const kindLabel = source?.authoritative_kind
    ? KIND_LABEL_SHORT[source.authoritative_kind] ?? source.authoritative_kind
    : sourceId === "__no_source"
      ? "Not from an uploaded document"
      : "Authoritative source";
  const uploaded = source?.created_at
    ? new Date(source.created_at).toLocaleDateString()
    : null;

  return (
    <div
      data-req-group-id={sourceId}
      className={
        "rounded-2xl border bg-background/60 p-3 transition-colors " +
        (highlight ? "border-amber-400 shadow-lg" : "border-border/60")
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={"h-4 w-4 transition-transform " + (open ? "" : "-rotate-90")}
          />
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-muted-foreground">
              {kindLabel}
              {uploaded ? ` · uploaded ${uploaded}` : ""} · {total} requirement
              {total === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {OBLIGATION_ORDER.map(({ key, label }) => {
            const items = byCat.get(key) ?? [];
            if (items.length === 0) return null;
            return (
              <CategorySection
                key={key}
                orgId={orgId}
                categoryKey={key}
                categoryLabel={label}
                items={items}
                heldCodes={heldCodes}
                activations={activations}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  orgId,
  categoryKey,
  categoryLabel,
  items,
  heldCodes,
  activations,
}: {
  orgId: string;
  categoryKey: string;
  categoryLabel: string;
  items: RequirementCategoryRow[];
  heldCodes: Set<string>;
  activations: Map<string, { confirmed_at: string; confirmed_by: string }>;
}) {
  const [open, setOpen] = useState<boolean>(true);
  return (
    <div className="rounded-lg border border-border/40 bg-background p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={"h-3.5 w-3.5 transition-transform " + (open ? "" : "-rotate-90")}
          />
          <span className="text-xs font-semibold">{categoryLabel}</span>
          <Badge variant="outline" className="text-[10px]">
            {items.length}
          </Badge>
        </div>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {categoryKey === "billing_code" ? (
            <BillingCodeSubgroups
              orgId={orgId}
              items={items}
              heldCodes={heldCodes}
              activations={activations}
            />
          ) : (
            items.map((r) => (
              <RequirementCard
                key={r.id}
                canEdit
                requirement={{
                  id: r.id,
                  original_title: r.original_title,
                  original_description: r.original_description,
                  original_source_citation: r.original_source_citation,
                  title: r.title,
                  description: r.description,
                  source_citation: r.source_citation,
                  obligation_category: r.obligation_category,
                  obligation_category_source: r.obligation_category_source,
                  activation_state: r.activation_state,
                  confirmed_optional: r.confirmed_optional,
                  service_code: r.service_code ?? null,
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BillingCodeSubgroups({
  orgId,
  items,
  heldCodes,
  activations,
}: {
  orgId: string;
  items: RequirementCategoryRow[];
  heldCodes: Set<string>;
  activations: Map<string, { confirmed_at: string; confirmed_by: string }>;
}) {
  const activateFn = useServerFn(activateCodeRequirements);
  const qc = useQueryClient();
  const activate = useMutation({
    mutationFn: (serviceCode: string) =>
      activateFn({ data: { organizationId: orgId, serviceCode } }),
    onSuccess: (res, code) => {
      toast.success(`Activated ${res.activatedCount} requirements for ${code}`);
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
      qc.invalidateQueries({ queryKey: ["code-activations", orgId] });
      qc.invalidateQueries({ queryKey: ["nectar-pending-code-activations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byCode = new Map<string, RequirementCategoryRow[]>();
  for (const r of items) {
    const code = (r.service_code ?? "__uncoded").toUpperCase();
    const arr = byCode.get(code) ?? [];
    arr.push(r);
    byCode.set(code, arr);
  }
  const sortedCodes = Array.from(byCode.keys()).sort();

  return (
    <div className="space-y-2">
      {sortedCodes.map((code) => {
        const rows = byCode.get(code)!;
        const held = heldCodes.has(code);
        const activation = activations.get(code);
        const pendingCount = rows.filter(
          (r) => r.activation_state === "pending_code_activation",
        ).length;

        // Header state
        let header: React.ReactNode;
        if (!held) {
          header = (
            <span className="text-[11px] text-muted-foreground">
              Inactive — you don't hold code {code}. Visible for planning;
              NECTAR won't enforce these until you add the code.
            </span>
          );
        } else if (activation && pendingCount === 0) {
          header = (
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Active since {new Date(activation.confirmed_at).toLocaleDateString()} by{" "}
              {activation.confirmed_by.slice(0, 8)}
            </span>
          );
        } else if (pendingCount > 0) {
          header = (
            <Button
              size="sm"
              variant="outline"
              disabled={activate.isPending && activate.variables === code}
              onClick={() => activate.mutate(code)}
              className="h-7 border-amber-400 bg-amber-50 text-[11px] text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Pending — Activate {pendingCount} requirement
              {pendingCount === 1 ? "" : "s"} for {code}
            </Button>
          );
        } else {
          header = (
            <span className="text-[11px] text-muted-foreground">
              Active for {code}
            </span>
          );
        }

        return (
          <div key={code} className="rounded-md border border-border/40 bg-background p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {code}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {rows.length} requirement{rows.length === 1 ? "" : "s"}
                </span>
              </div>
              {header}
            </div>
            <div className="space-y-2">
              {rows.map((r) => (
                <RequirementCard
                  key={r.id}
                  canEdit
                  requirement={{
                    id: r.id,
                    original_title: r.original_title,
                    original_description: r.original_description,
                    original_source_citation: r.original_source_citation,
                    title: r.title,
                    description: r.description,
                    source_citation: r.source_citation,
                    obligation_category: r.obligation_category,
                    obligation_category_source: r.obligation_category_source,
                    activation_state: r.activation_state,
                    confirmed_optional: r.confirmed_optional,
                    service_code: r.service_code ?? null,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
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
    let notApplicable = 0;
    for (const i of group.items) {
      const eff = effectiveStatusOf(i);
      if (eff === "removed") {
        removed += 1;
      } else if (eff === "not_applicable") {
        notApplicable += 1;
      } else if (eff === "confirmed") {
        if (isScopeReady(applicByReq.get(i.id))) fullyConfirmed += 1;
        else scopePending += 1;
      } else {
        needs += 1;
      }
    }
    return {
      total: group.items.length,
      confirmed: fullyConfirmed + scopePending,
      fullyConfirmed,
      scopePending,
      needs,
      removed,
      notApplicable,
    };
  }, [group.items, applicByReq]);

  const [open, setOpen] = useState(counts.needs > 0);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  // Sort: needs_attention first (with proposals first), then scope_pending,
  // then fully_confirmed, then not_applicable, then removed.
  const sortedItems = useMemo(() => {
    const score = (r: ReqRow) => {
      const eff = effectiveStatusOf(r);
      if (eff === "removed") return 5;
      if (eff === "not_applicable") return 4;
      if (eff === "needs_attention") {
        const stats = applicByReq.get(r.id);
        const hasProposals = stats && stats.pending > 0 && stats.unknown === 0;
        return hasProposals ? -1 : 0;
      }
      if (eff === "confirmed") {
        return isScopeReady(applicByReq.get(r.id)) ? 3 : 1;
      }
      return 2;
    };
    return [...group.items].sort(
      (a, b) => score(a) - score(b) || a.title.localeCompare(b.title),
    );
  }, [group.items, applicByReq]);

  const [rowFilter, setRowFilter] = useState<
    "all" | "needs_attention" | "fully_confirmed" | "not_applicable"
  >("all");
  const [confirmedCollapsed, setConfirmedCollapsed] = useState(true);

  const activeItems = sortedItems.filter((r) => {
    const eff = effectiveStatusOf(r);
    return (
      eff === "needs_attention" ||
      (eff === "confirmed" && !isScopeReady(applicByReq.get(r.id)))
    );
  });
  const doneItems = sortedItems.filter((r) => {
    const eff = effectiveStatusOf(r);
    return eff === "confirmed" && isScopeReady(applicByReq.get(r.id));
  });
  const notApplicableItems = sortedItems.filter(
    (r) => effectiveStatusOf(r) === "not_applicable",
  );
  const removedItems = sortedItems.filter((r) => statusOf(r) === "removed");

  // ---- Batch confirmation (SOW/authoritative-source rows only) ----
  const qc = useQueryClient();
  const setStatusFn = useServerFn(setRequirementReviewStatus);
  const confirmAllFn = useServerFn(confirmRequirementWithScopes);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);

  // A row is batch-selectable only if it's from an authoritative document,
  // currently needs attention, and visible under the active filter.
  const selectableIds = useMemo(() => {
    const visible =
      rowFilter === "needs_attention" || rowFilter === "all"
        ? activeItems
        : [];
    return visible
      .filter(
        (r) =>
          r.origin === "document" &&
          effectiveStatusOf(r) === "needs_attention",
      )
      .map((r) => r.id);
  }, [activeItems, rowFilter]);
  const selectableIdSet = useMemo(() => new Set(selectableIds), [selectableIds]);

  // Prune selection when the visible/selectable set changes.
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (selectableIdSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectableIdSet]);

  const toggleOne = (id: string, next: boolean) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
  };

  const allShownSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAllShown = () => {
    setSelected((prev) => {
      if (allShownSelected) {
        const next = new Set(prev);
        for (const id of selectableIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of selectableIds) next.add(id);
      return next;
    });
  };

  const runBatchConfirm = async () => {
    const ids = Array.from(selected).filter((id) => selectableIdSet.has(id));
    if (ids.length === 0) return;
    setBatchRunning(true);
    let ok = 0;
    let failed = 0;
    const byId = new Map(sortedItems.map((r) => [r.id, r] as const));
    const CONCURRENCY = 4;
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, ids.length) },
      async () => {
        while (true) {
          const i = cursor++;
          if (i >= ids.length) return;
          const id = ids[i];
          const r = byId.get(id);
          if (!r) {
            failed += 1;
            continue;
          }
          const stats = applicByReq.get(id);
          const pendingProposals = stats
            ? Math.max(0, stats.pending - stats.unknown)
            : 0;
          const useScopes = pendingProposals > 0;
          try {
            if (useScopes) {
              await confirmAllFn({ data: { requirementId: id } });
            } else {
              await setStatusFn({ data: { id, status: "confirmed" } });
            }
            ok += 1;
          } catch {
            failed += 1;
          }
        }
      },
    );
    await Promise.all(workers);
    qc.invalidateQueries({ queryKey: ["requirements", orgId] });
    qc.invalidateQueries({ queryKey: ["req-mappings-all", orgId] });
    qc.invalidateQueries({ queryKey: ["attestations", orgId] });
    setSelected(new Set());
    setBatchRunning(false);
    if (failed === 0) {
      toast.success(`Confirmed ${ok} requirement${ok === 1 ? "" : "s"}.`);
    } else if (ok === 0) {
      toast.error(`Couldn't confirm any of the ${failed} selected requirements.`);
    } else {
      toast.error(
        `Confirmed ${ok} of ${ok + failed}. ${failed} failed — try again.`,
      );
    }
  };




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
          {counts.notApplicable > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
              title="Auto set aside — tied to service codes this org isn't authorized for. Reversible."
            >
              {counts.notApplicable} not applicable
            </Badge>
          )}
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
        <div className="border-t border-border/40">
          {/* Row filter */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-1 pt-2.5">
            <span className="text-[10px] text-muted-foreground">Show:</span>
            {(
              [
                { key: "all" as const, label: "All" },
                {
                  key: "needs_attention" as const,
                  label: `Needs attention (${activeItems.length})`,
                },
                {
                  key: "fully_confirmed" as const,
                  label: `Fully confirmed (${doneItems.length})`,
                },
                ...(notApplicableItems.length > 0
                  ? ([
                      {
                        key: "not_applicable" as const,
                        label: `Not applicable (${notApplicableItems.length})`,
                      },
                    ] as const)
                  : ([] as const)),
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setRowFilter(f.key);
                  if (f.key === "all") setConfirmedCollapsed(true);
                  if (f.key === "fully_confirmed") setConfirmedCollapsed(false);
                }}

                aria-pressed={rowFilter === f.key}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition ${
                  rowFilter === f.key
                    ? "bg-amber-500 text-amber-950 ring-1 ring-amber-600 shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>

            ))}
          </div>

          {/* Batch confirmation bar — only visible when needs-attention
              SOW rows are currently rendered. */}
          {(rowFilter === "all" || rowFilter === "needs_attention") &&
            selectableIds.length > 0 && (
              <div className="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={allShownSelected}
                    onCheckedChange={() => toggleAllShown()}
                    aria-label="Select all requirements currently shown"
                  />
                  <span className="font-medium">
                    Select all shown ({selectableIds.length})
                  </span>
                </label>
                <span className="text-muted-foreground">
                  {selected.size > 0
                    ? `${selected.size} selected — each will be logged individually to the attestation trail.`
                    : "Tick individual rows below, or select all shown."}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  {selected.size > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setSelected(new Set())}
                      disabled={batchRunning}
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-7 bg-amber-500 text-[11px] text-amber-950 hover:bg-amber-400"
                    onClick={() => runBatchConfirm()}
                    disabled={selected.size === 0 || batchRunning}
                  >
                    {batchRunning ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    )}
                    Confirm {selected.size > 0 ? selected.size : ""} selected
                  </Button>
                </div>
              </div>
            )}

          <ul className="divide-y divide-border/40 px-4 pb-2">
            {group.items.length === 0 && (
              <li className="py-4 text-xs text-muted-foreground">
                No requirements drafted yet.
              </li>
            )}

            {rowFilter === "needs_attention" && activeItems.length === 0 && (
              <li className="py-4 text-xs text-muted-foreground">
                No requirements need attention in this group.
              </li>
            )}
            {rowFilter === "fully_confirmed" && doneItems.length === 0 && (
              <li className="py-4 text-xs text-muted-foreground">
                No fully confirmed requirements in this group.
              </li>
            )}

            {/* Active items */}
            {(rowFilter === "all" || rowFilter === "needs_attention") &&
              activeItems.map((r) => {
                const isSelectable = selectableIdSet.has(r.id);
                return (
                  <RequirementRow
                    key={r.id}
                    req={r}
                    orgId={orgId}
                    sourceMeta={group.source}
                    applicStats={applicByReq.get(r.id)}
                    selectable={isSelectable}
                    selected={isSelectable && selected.has(r.id)}
                    onToggleSelect={isSelectable ? toggleOne : undefined}
                  />
                );
              })}


            {/* Fully confirmed collapsible section (default "all" view) */}
            {rowFilter === "all" && doneItems.length > 0 && (
              <>
                <li className="py-1">
                  <button
                    type="button"
                    onClick={() => setConfirmedCollapsed((v) => !v)}
                    className="flex w-full items-center gap-1.5 py-1.5 text-left text-[11px] font-medium text-emerald-700 transition hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                  >
                    <span
                      className={`inline-block transition-transform ${confirmedCollapsed ? "" : "rotate-90"}`}
                    >
                      ▸
                    </span>
                    <CheckCircle2 className="h-3 w-3" />
                    {doneItems.length} fully confirmed
                    <span className="ml-1 font-normal text-muted-foreground">
                      — click to {confirmedCollapsed ? "expand" : "collapse"}
                    </span>
                  </button>
                </li>
                {!confirmedCollapsed &&
                  doneItems.map((r) => (
                    <RequirementRow
                      key={r.id}
                      req={r}
                      orgId={orgId}
                      sourceMeta={group.source}
                      applicStats={applicByReq.get(r.id)}
                    />
                  ))}
              </>
            )}

            {/* Fully confirmed items when filter is explicitly set */}
            {rowFilter === "fully_confirmed" &&
              doneItems.map((r) => (
                <RequirementRow
                  key={r.id}
                  req={r}
                  orgId={orgId}
                  sourceMeta={group.source}
                  applicStats={applicByReq.get(r.id)}
                />
              ))}

            {/* Not-applicable items (auto set aside for out-of-scope codes).
                Rendered above the removed section in "all" and as the sole
                content when the filter is explicitly "not_applicable". */}
            {(rowFilter === "all" || rowFilter === "not_applicable") &&
              notApplicableItems.map((r) => (
                <RequirementRow
                  key={r.id}
                  req={r}
                  orgId={orgId}
                  sourceMeta={group.source}
                  applicStats={applicByReq.get(r.id)}
                />
              ))}
            {rowFilter === "not_applicable" && notApplicableItems.length === 0 && (
              <li className="py-4 text-xs text-muted-foreground">
                No auto set-aside requirements in this group.
              </li>
            )}

            {/* Removed items at bottom for "all" view */}
            {rowFilter === "all" &&
              removedItems.map((r) => (
                <RequirementRow
                  key={r.id}
                  req={r}
                  orgId={orgId}
                  sourceMeta={group.source}
                  applicStats={applicByReq.get(r.id)}
                />
              ))}

          </ul>
        </div>
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
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  req: ReqRow;
  orgId: string;
  sourceMeta?: SourceMeta | null;
  applicStats?: ApplicStats;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
}) {

  const qc = useQueryClient();
  const setStatusFn = useServerFn(setRequirementReviewStatus);
  const confirmAllFn = useServerFn(confirmRequirementWithScopes);
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
  const confirmAll = useMutation({
    mutationFn: () => confirmAllFn({ data: { requirementId: req.id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
      qc.invalidateQueries({ queryKey: ["req-mappings", orgId, req.id] });
      qc.invalidateQueries({ queryKey: ["req-mappings-all", orgId] });
      qc.invalidateQueries({ queryKey: ["attestations", orgId] });
      toast.success(
        r.scopesConfirmed > 0
          ? `Confirmed requirement + ${r.scopesConfirmed} applicability scope${
              r.scopesConfirmed === 1 ? "" : "s"
            }.`
          : "Confirmed requirement.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = statusOf(req);
  const isRemoved = status === "removed";
  const isConfirmed = status === "confirmed";
  const isFullyConfirmed = isConfirmed && isScopeReady(applicStats);
  const isFromAuthSource = req.origin === "document" && !!req.source_document_id;
  // Auto set-aside: derived from provider_authorized_codes, reversible on
  // every read. Distinct from manual removal — no audit-trail warning, no
  // human intent captured; just "your org isn't authorized for this code".
  const isNotApplicable = !isRemoved && req.scope_state === "out_of_scope";
  const offendingCodes = req.out_of_scope_codes ?? [];


  // NECTAR pre-fill awareness: if there are pending non-unknown proposals,
  // the admin can approve requirement + scope together in one click.
  const pendingProposals = applicStats
    ? Math.max(0, applicStats.pending - applicStats.unknown)
    : 0;
  const hasPrefilledProposals = pendingProposals > 0 && !isConfirmed && !isRemoved;
  const hasUnknownProposals = (applicStats?.unknown ?? 0) > 0;

  const [removeOpen, setRemoveOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [attestOpen, setAttestOpen] = useState(false);

  // Internal vs external classification (stored in metadata, falls back to heuristic)
  const md = (req.metadata ?? {}) as Record<string, unknown>;
  const storedClass = md["classification"] as "internal" | "external" | undefined;
  const inferred = storedClass
    ? null
    : inferClassification({
        title: req.title,
        description: req.description,
        source_citation: req.source_citation,
      });
  const classification: "internal" | "external" =
    storedClass ?? (inferred?.classification ?? "internal");
  const externalSystem =
    (md["external_system"] as string | null | undefined) ?? inferred?.externalSystem ?? null;
  const renewalDueAt = (md["renewal_due_at"] as string | null | undefined) ?? null;
  const trackingMd = (md["tracking"] ?? {}) as Partial<RequirementTracking>;
  const trackingState = computeRequirementDueState(md);




  return (
    <li
      className={`${isRemoved ? "opacity-55" : ""} ${isNotApplicable ? "opacity-70 bg-muted/30" : ""} ${isFullyConfirmed ? "border-l-[3px] border-l-emerald-400/50 bg-emerald-500/[0.06] py-2" : "py-3"}`}
    >

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

      {selectable && onToggleSelect && (
        <div className="mt-1 shrink-0 sm:mr-2">
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onToggleSelect(req.id, v === true)}
            aria-label={`Select requirement: ${req.title}`}
          />
        </div>
      )}

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
          {status === "needs_attention" && hasPrefilledProposals && (
            <Badge
              className="bg-[#d97a1c]/15 text-[10px] text-[#d97a1c]"
              title="NECTAR has pre-filled its proposed applicability for this requirement — review and approve."
            >
              <Sparkle className="mr-1 h-3 w-3" />
              NECTAR proposal ready ({pendingProposals})
            </Badge>
          )}
          {status === "needs_attention" && hasUnknownProposals && (
            <Badge
              variant="outline"
              className="text-[10px] text-red-700 dark:text-red-300"
              title="NECTAR couldn't confidently determine scope — needs your judgement."
            >
              Low confidence
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
          {isNotApplicable && (
            <Badge
              variant="outline"
              className="text-[10px] border-slate-400/50 text-muted-foreground"
              title={
                offendingCodes.length > 0
                  ? `Auto set aside — your org isn't authorized for service code${
                      offendingCodes.length === 1 ? "" : "s"
                    } ${offendingCodes.join(", ")}. Reversible: if authorization is added, this becomes reviewable again automatically.`
                  : "Auto set aside — your org isn't authorized for the service code(s) this requirement is tied to. Reversible."
              }
            >
              Not applicable — service code not authorized
              {offendingCodes.length > 0 ? ` (${offendingCodes.join(", ")})` : ""}
            </Badge>
          )}

          {classification === "external" ? (
            <Badge
              variant="outline"
              className="text-[10px] border-sky-500/40 text-sky-700 dark:text-sky-300"
              title={`External action${externalSystem ? ` — happens in ${externalSystem}` : ""}. HIVE tracks your attestation; the action itself happens outside HIVE.`}
            >
              <ExternalLinkIcon className="mr-1 h-3 w-3" />
              External{externalSystem ? ` · ${externalSystem}` : ""}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] border-slate-500/30 text-muted-foreground"
              title="HIVE produces and holds evidence for this requirement internally."
            >
              <Building className="mr-1 h-3 w-3" />
              Internal
            </Badge>
          )}
          {renewalDueAt && (
            <Badge
              variant="outline"
              className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300"
              title={`Next renewal: ${new Date(renewalDueAt).toLocaleDateString()}`}
            >
              Renewal {new Date(renewalDueAt).toLocaleDateString()}
            </Badge>
          )}
          {isConfirmed && (
            <Badge
              variant="outline"
              className={
                "text-[10px] cursor-pointer " +
                (trackingState.state === "overdue"
                  ? "border-red-500/50 text-red-700 dark:text-red-300"
                  : trackingState.state === "due" || trackingState.state === "due_soon"
                    ? "border-amber-500/50 text-amber-700 dark:text-amber-300"
                    : trackingState.state === "never_checked"
                      ? "border-slate-500/40 text-muted-foreground"
                      : trackingState.frequency
                        ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                        : "border-slate-500/30 text-muted-foreground")
              }
              onClick={() => setTrackingOpen(true)}
              title={
                trackingMd.tell_nectar_note
                  ? `You said: ${trackingMd.tell_nectar_note}`
                  : "Set how you track this requirement"
              }
            >
              {trackingState.frequency
                ? `${frequencyLabel(trackingState.frequency)}${
                    trackingState.state === "overdue"
                      ? ` · overdue ${trackingState.daysOverdue}d`
                      : trackingState.state === "due"
                        ? " · due today"
                        : trackingState.state === "due_soon" && trackingState.daysOverdue !== null
                          ? ` · due in ${-trackingState.daysOverdue}d`
                          : trackingState.state === "never_checked"
                            ? " · never checked"
                            : trackingState.lastCheckedAt
                              ? ` · last ${trackingState.lastCheckedAt}`
                              : ""
                  }`
                : "Set tracking"}
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
        {classification === "external" && !isRemoved && !isNotApplicable && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-sky-500/40 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"
            onClick={() => setAttestOpen(true)}
            title="Log your attestation that this external action was completed"
          >
            <ExternalLinkIcon className="mr-1 h-3.5 w-3.5" />
            Attest external completion
          </Button>
        )}
        {isNotApplicable ? (
          <span
            className="text-[10px] text-muted-foreground"
            title="Auto set aside from service-code scope. Add the code under Provider authorization to make this reviewable again."
          >
            Auto set aside
          </span>
        ) : isRemoved ? (
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
            ) : hasPrefilledProposals ? (
              <>
                <Button
                  size="sm"
                  className="bg-amber-500 text-amber-950 hover:bg-amber-400"
                  onClick={() => confirmAll.mutate()}
                  disabled={confirmAll.isPending || set.isPending}
                  title={`Approve NECTAR's proposal: confirm this requirement and its ${pendingProposals} proposed scope${
                    pendingProposals === 1 ? "" : "s"
                  } in one step.`}
                >
                  {confirmAll.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  )}
                  Looks right — confirm ({pendingProposals})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-[11px] text-muted-foreground"
                  onClick={() => set.mutate({ status: "confirmed" })}
                  disabled={set.isPending || confirmAll.isPending}
                  title="Confirm just the requirement; review the scope manually below."
                >
                  Just the requirement
                </Button>
              </>
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
      <AttestExternalDialog
        open={attestOpen}
        onOpenChange={setAttestOpen}
        requirementId={req.id}
        requirementTitle={req.title}
        externalSystem={externalSystem}
        orgId={orgId}
      />
      <RequirementTrackingEditor
        open={trackingOpen}
        onOpenChange={setTrackingOpen}
        requirementId={req.id}
        requirementTitle={req.title}
        orgId={orgId}
        current={trackingMd}
      />
    </li>
  );
}

function AttestExternalDialog({
  open,
  onOpenChange,
  requirementId,
  requirementTitle,
  externalSystem,
  orgId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requirementId: string;
  requirementTitle: string;
  externalSystem: string | null;
  orgId: string;
}) {
  const qc = useQueryClient();
  const attestFn = useServerFn(attestExternalCompletion);
  const [completedOn, setCompletedOn] = useState("");
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [nextRenewalAt, setNextRenewalAt] = useState("");
  const [notes, setNotes] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      attestFn({
        data: {
          requirementId,
          completedOn: completedOn || undefined,
          reference: reference || undefined,
          proofUrl: proofUrl || undefined,
          nextRenewalAt: nextRenewalAt || undefined,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
      qc.invalidateQueries({ queryKey: ["attestations", orgId] });
      toast.success("Attestation logged.", {
        description: "HIVE recorded that this external action was completed.",
      });
      onOpenChange(false);
      setCompletedOn(""); setReference(""); setProofUrl(""); setNextRenewalAt(""); setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLinkIcon className="h-4 w-4 text-sky-600" />
            Attest external completion
          </DialogTitle>
          <DialogDescription>
            {externalSystem
              ? `Log that "${requirementTitle}" was completed in ${externalSystem}.`
              : `Log that "${requirementTitle}" was completed in the external system.`}{" "}
            HIVE records this attestation — it does not verify the external system.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="att-completed" className="text-xs">Completed on</Label>
              <Input id="att-completed" type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="att-renewal" className="text-xs">Next renewal (optional)</Label>
              <Input id="att-renewal" type="date" value={nextRenewalAt} onChange={(e) => setNextRenewalAt(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="att-ref" className="text-xs">Reference / confirmation number</Label>
            <Input id="att-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UPI-2025-00123" />
          </div>
          <div>
            <Label htmlFor="att-proof" className="text-xs">Proof URL (optional)</Label>
            <Input id="att-proof" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label htmlFor="att-notes" className="text-xs">Notes</Label>
            <Textarea id="att-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Log attestation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <DialogDescription className="text-xs">
            Add a requirement that isn't drafted from an uploaded source. It's logged to the attestation trail like any other.
          </DialogDescription>
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
                    <span className="min-w-0 flex-1 basis-full break-words text-[11px] text-muted-foreground sm:basis-auto">
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

            <div className="flex flex-wrap items-end gap-1.5">
              <div className="min-w-0">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Add scope
                </Label>
                <Select
                  value={addKind}
                  onValueChange={(v) => setAddKind(v as MappingRow["scope_kind"])}
                >
                  <SelectTrigger className="h-8 w-full min-w-0 text-[11px] sm:w-[140px]">
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
                  className="h-8 w-full min-w-0 text-[11px] sm:w-24"
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
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden border-border/60 bg-background/95 p-0 backdrop-blur-xl sm:w-full">
        <DialogHeader className="shrink-0 space-y-2 border-b border-border/60 px-5 py-4 sm:px-6">
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
          <DialogTitle className="mt-1 break-words text-base leading-snug">
            {req.title}
          </DialogTitle>
          <DialogDescription className="break-words text-xs">
            Review the requirement in full before confirming. Confirm and remove
            actions log to the Attestation trail.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-4 text-sm sm:px-6">

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
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">

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
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
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

        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-border/60 px-5 py-3 sm:px-6 sm:gap-2">

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

// ---------- Prompt 31: Review Queue ----------
// Walks the admin through every needs-attention requirement one at a time
// with NECTAR's pre-filled proposal visible. Keyboard-friendly: A approve,
// S skip, R remove, ←/→ navigate.

function ReviewQueueDialog({
  open,
  onOpenChange,
  orgId,
  items,
  applicByReq,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  items: ReqRow[];
  applicByReq: Map<string, ApplicStats>;
}) {
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [highConfidenceOnly, setHighConfidenceOnly] = useState(false);

  const filtered = useMemo(() => {
    if (!highConfidenceOnly) return items;
    return items.filter((i) => {
      const s = applicByReq.get(i.id);
      return !!s && s.unknown === 0 && s.pending > 0;
    });
  }, [items, applicByReq, highConfidenceOnly]);

  useEffect(() => {
    if (filtered.length === 0) setIndex(0);
    else if (index >= filtered.length) setIndex(filtered.length - 1);
  }, [filtered.length, index]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const current = filtered[index];

  const listMapFn = useServerFn(listRequirementMappings);
  const mapsQ = useQuery({
    enabled: open && !!current,
    queryKey: ["req-mappings", orgId, current?.id],
    queryFn: () =>
      listMapFn({
        data: { organizationId: orgId, requirementId: current!.id },
      }),
  });

  const confirmAllFn = useServerFn(confirmRequirementWithScopes);
  const setStatusFn = useServerFn(setRequirementReviewStatus);
  const proposeFn = useServerFn(proposeRequirementMappings);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["requirements", orgId] });
    qc.invalidateQueries({ queryKey: ["req-mappings-all", orgId] });
    qc.invalidateQueries({ queryKey: ["attestations", orgId] });
    if (current)
      qc.invalidateQueries({ queryKey: ["req-mappings", orgId, current.id] });
  };

  const advance = () => {
    setIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
  };

  const approve = useMutation({
    mutationFn: () => confirmAllFn({ data: { requirementId: current!.id } }),
    onSuccess: (r) => {
      invalidate();
      toast.success(
        r.scopesConfirmed > 0
          ? `Approved — confirmed requirement + ${r.scopesConfirmed} scope${r.scopesConfirmed === 1 ? "" : "s"}.`
          : "Approved.",
      );
      advance();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmJustReq = useMutation({
    mutationFn: () =>
      setStatusFn({ data: { id: current!.id, status: "confirmed" } }),
    onSuccess: () => {
      invalidate();
      toast.success("Requirement confirmed; review scope later.");
      advance();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () =>
      setStatusFn({
        data: {
          id: current!.id,
          status: "removed",
          attestStatement: REMOVE_ATTESTATION_TEXT,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.message("Removed from active use.");
      advance();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const propose = useMutation({
    mutationFn: () => proposeFn({ data: { requirementId: current!.id } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if ((e.key === "a" || e.key === "A") && current && !approve.isPending) {
        e.preventDefault();
        approve.mutate();
      } else if ((e.key === "s" || e.key === "S") && current) {
        e.preventDefault();
        advance();
      } else if ((e.key === "r" || e.key === "R") && current && !remove.isPending) {
        e.preventDefault();
        remove.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered.length, current?.id, approve.isPending, remove.isPending]);

  const rows = (mapsQ.data?.mappings ?? []) as unknown as MappingRow[];
  const pendingScopes = rows.filter((m) => !m.confirmed && m.scope_kind !== "unknown");
  const unknownScopes = rows.filter((m) => m.scope_kind === "unknown");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-amber-600" />
            Review queue
          </DialogTitle>
          <DialogDescription className="text-xs">
            Walk through every requirement that still needs review. NECTAR's
            pre-filled proposal is shown; you approve, edit, or remove.
            Shortcuts: <kbd className="rounded bg-muted px-1">A</kbd> approve ·{" "}
            <kbd className="rounded bg-muted px-1">S</kbd> skip ·{" "}
            <kbd className="rounded bg-muted px-1">R</kbd> remove ·{" "}
            <kbd className="rounded bg-muted px-1">←</kbd>/
            <kbd className="rounded bg-muted px-1">→</kbd> navigate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            {filtered.length === 0
              ? "Nothing left to review."
              : `Item ${index + 1} of ${filtered.length}`}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5">
            <Checkbox
              checked={highConfidenceOnly}
              onCheckedChange={(v) => setHighConfidenceOnly(v === true)}
              className="h-3.5 w-3.5"
            />
            High-confidence only (skip unknown scopes)
          </label>
        </div>

        {!current ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-background/60 p-8 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
            All caught up — every requirement matching this filter has been
            reviewed.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{current.title}</h3>
                {current.category && (
                  <Badge variant="outline" className="text-[10px]">
                    {current.category}
                  </Badge>
                )}
                <SourceCitationChip citation={current.source_citation} />
              </div>
              {current.description && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {current.description}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-50/40 p-3 dark:bg-amber-500/5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#d97a1c]">
                  <Sparkle className="h-3 w-3" /> NECTAR's proposed applicability
                </span>
                {rows.length === 0 && !mapsQ.isLoading && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
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
                )}
              </div>
              {mapsQ.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading proposal…
                </div>
              ) : rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No proposal yet. Ask NECTAR to propose, or open Details to
                  add scope manually.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rows.map((m) => (
                    <li
                      key={m.id}
                      className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
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
                      {!m.confirmed && m.scope_kind !== "unknown" && (
                        <Badge className="bg-[#d97a1c]/15 text-[10px] text-[#d97a1c]">
                          proposed
                        </Badge>
                      )}
                      {m.scope_kind === "unknown" && (
                        <Badge variant="outline" className="text-[10px] text-red-700 dark:text-red-300">
                          needs your judgement
                        </Badge>
                      )}
                      {m.rationale && (
                        <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                          {m.rationale}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {unknownScopes.length > 0 && (
                <p className="mt-2 flex items-start gap-1 text-[11px] text-red-700 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  NECTAR flagged {unknownScopes.length} scope
                  {unknownScopes.length === 1 ? "" : "s"} as unknown — those
                  won't be auto-confirmed.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={!current || index === 0}
              aria-label="Previous"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
              }
              disabled={!current || index >= filtered.length - 1}
              aria-label="Next"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={advance}
              disabled={!current}
              title="Skip (S) — leave for later"
            >
              Skip
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-red-700 hover:bg-red-500/10 dark:text-red-300"
              onClick={() => remove.mutate()}
              disabled={!current || remove.isPending}
              title="Remove from active set (R)"
            >
              {remove.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              Remove
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => confirmJustReq.mutate()}
              disabled={!current || confirmJustReq.isPending}
              title="Confirm just the requirement; review scope manually"
            >
              {confirmJustReq.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Just the requirement
            </Button>
            <Button
              size="sm"
              className="bg-amber-500 text-amber-950 hover:bg-amber-400"
              onClick={() => approve.mutate()}
              disabled={!current || approve.isPending}
              title="Approve NECTAR's proposal (A)"
            >
              {approve.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              )}
              Approve{pendingScopes.length > 0 ? ` (+${pendingScopes.length})` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Three-party approval chain: provider's final-confirmation queue ----------

function AwaitingFinalConfirmationPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProviderPendingConfirmations);
  const confirmFn = useServerFn(providerConfirmRequirement);
  const rejectFn = useServerFn(providerRejectRequirement);

  const { data } = useQuery({
    queryKey: ["provider-pending-confirmations", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  const confirm = useMutation({
    mutationFn: (vars: {
      requirementId: string;
      note?: string;
      frequency?: string | null;
      tellNectarNote?: string | null;
      lastCheckedAt?: string | null;
    }) =>
      confirmFn({
        data: {
          requirementId: vars.requirementId,
          note: vars.note ?? null,
          frequency: (vars.frequency ?? undefined) as
            | "one_time"
            | "per_employee"
            | "per_shift"
            | "per_code"
            | "per_day"
            | "per_week"
            | "per_month"
            | "per_quarter"
            | "per_year"
            | "per_billing_rate_unit"
            | "ongoing"
            | undefined,
          tellNectarNote: vars.tellNectarNote ?? undefined,
          lastCheckedAt: vars.lastCheckedAt ?? undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Requirement confirmed — now active in your compliance set.");
      qc.invalidateQueries({ queryKey: ["provider-pending-confirmations", orgId] });
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (vars: { requirementId: string; reason: string }) =>
      rejectFn({ data: { requirementId: vars.requirementId, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Sent back. NECTAR and HIVE Exec will see your note.");
      qc.invalidateQueries({ queryKey: ["provider-pending-confirmations", orgId] });
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = ((data?.items ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    source_citation: string | null;
    applies_to: string | null;
  }>);

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-emerald-300/60 bg-emerald-50/40 p-4 dark:bg-emerald-950/20">
      <header className="mb-3 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
            Awaiting your final confirmation ({items.length})
          </h3>
          <p className="mt-0.5 max-w-3xl text-xs text-emerald-900/80 dark:text-emerald-100/80">
            HIVE Executive verified that NECTAR extracted these requirements
            faithfully from your authoritative sources. <strong>You</strong> are
            the final authority on whether they apply to your operation —
            confirm to make them active, or send back with a note.
          </p>
        </div>
      </header>

      <ul className="space-y-2">
        {items.map((r) => (
          <FinalConfirmRow
            key={r.id}
            row={r}
            onConfirm={(payload) =>
              confirm.mutate({
                requirementId: r.id,
                note: payload.note,
                frequency: payload.frequency,
                tellNectarNote: payload.tellNectarNote,
                lastCheckedAt: payload.lastCheckedAt,
              })
            }
            onReject={(reason) => reject.mutate({ requirementId: r.id, reason })}
            busy={confirm.isPending || reject.isPending}
          />
        ))}
      </ul>
    </section>
  );
}

function FinalConfirmRow({
  row,
  onConfirm,
  onReject,
  busy,
}: {
  row: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    source_citation: string | null;
    applies_to: string | null;
  };
  onConfirm: (payload: {
    note?: string;
    frequency?: string | null;
    tellNectarNote?: string | null;
    lastCheckedAt?: string | null;
  }) => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "confirm" | "reject">("idle");
  const [note, setNote] = useState("");
  const [frequency, setFrequency] = useState<string>("");
  const [tellNectarNote, setTellNectarNote] = useState("");
  const todayIso = new Date().toISOString().slice(0, 10);
  const [lastCheckedAt, setLastCheckedAt] = useState<string>(todayIso);

  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{row.title}</p>
          {row.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {row.description}
            </p>
          )}
          {row.source_citation && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Source: {row.source_citation}
            </p>
          )}
        </div>
        {mode === "idle" && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              onClick={() => setMode("confirm")}
              disabled={busy}
              className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setMode("reject")}
              disabled={busy}
            >
              Send back
            </Button>
          </div>
        )}
      </div>

      {mode === "confirm" && (
        <div className="mt-2 space-y-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-emerald-950">
              How often does this requirement recur? <span className="text-muted-foreground font-normal">(you decide)</span>
            </Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-8 bg-background">
                <SelectValue placeholder="Choose a cadence (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="per_employee">Per employee</SelectItem>
                <SelectItem value="per_shift">Per shift</SelectItem>
                <SelectItem value="per_code">Per billing code</SelectItem>
                <SelectItem value="per_day">Daily</SelectItem>
                <SelectItem value="per_week">Weekly</SelectItem>
                <SelectItem value="per_month">Monthly</SelectItem>
                <SelectItem value="per_quarter">Quarterly</SelectItem>
                <SelectItem value="per_year">Yearly</SelectItem>
                <SelectItem value="per_billing_rate_unit">Per billing-rate unit</SelectItem>
                <SelectItem value="ongoing">Ongoing</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-emerald-950">
              Tell NECTAR — how do <em>you</em> track this?
            </Label>
            <Textarea
              value={tellNectarNote}
              onChange={(e) => setTellNectarNote(e.target.value)}
              placeholder='e.g. "1056s live on the Provider UPI/USTEPS — updated ongoing."'
              rows={2}
              className="bg-background"
            />
            <p className="text-[11px] text-muted-foreground">
              Your words. NECTAR will surface this as a reminder — it won't invent a rule.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-emerald-950">Last verified</Label>
            <Input
              type="date"
              value={lastCheckedAt}
              onChange={(e) => setLastCheckedAt(e.target.value)}
              className="h-8 bg-background"
              max={todayIso}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-emerald-950">
              Audit-trail note <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (logged in audit trail)"
              rows={2}
              className="bg-background"
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() =>
                onConfirm({
                  note: note.trim() || undefined,
                  frequency: frequency || null,
                  tellNectarNote: tellNectarNote.trim() || null,
                  lastCheckedAt: lastCheckedAt || null,
                })
              }
              disabled={busy}
            >
              Make it active
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="mt-2 space-y-2 rounded-md border border-amber-300 bg-amber-50/60 p-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why doesn't this apply, or what should change? (required)"
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              className="h-8"
              onClick={() => {
                if (note.trim().length < 3) {
                  toast.error("Add a short reason (3+ characters).");
                  return;
                }
                onReject(note.trim());
              }}
              disabled={busy}
            >
              Send back
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
