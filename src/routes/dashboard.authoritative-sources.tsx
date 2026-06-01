import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle2,
  FileCheck,
  FileText,
  Loader2,
  ScrollText,
  ShieldCheck,
  Sparkles,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AttestationBanner } from "@/components/nectar/attestation-banner";
import { SourceCitationChip } from "@/components/nectar/source-citation-chip";
import { AuthoritativeSourceDrop } from "@/components/nectar/authoritative-source-drop";
import { ingestDocument } from "@/lib/nectar-documents.functions";
import {
  listAuthoritativeSources,
  markAsAuthoritativeSource,
  listRequirements,
  generateRequirementsFromSource,
  verifyRequirement,
  upsertRequirement,
  deleteRequirement,
  listAttestations,
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
          so authority is never implied. Client- and staff-specific files (PCSPs,
          1056 budgets, certifications, training records) belong in{" "}
          <span className="font-medium">Company Docs</span>.
        </p>
        <p className="rounded-lg border border-dashed border-[color:var(--amber-400,#f4a93a)]/60 bg-[color:var(--amber-50,#fffbeb)]/60 px-3 py-2 text-xs text-[color:var(--amber-800,#92400e)]">
          Tip — drop a PDF, scan, Word, or spreadsheet anywhere on this page and
          NECTAR will propose a label before saving it into the source-of-truth set.
        </p>
      </header>

  return (
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
          so authority is never implied. Client- and staff-specific files (PCSPs,
          1056 budgets, certifications, training records) belong in{" "}
          <span className="font-medium">Company Docs</span>.
        </p>
      </header>

      {orgId && (
        <AttestationBanner
          organizationId={orgId}
          scope="generic"
          mode="nudge"
        />
      )}

      <Tabs defaultValue="sources" className="space-y-4">
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
          {orgId ? <SourcesPanel orgId={orgId} /> : <LoadingCard />}
        </TabsContent>
        <TabsContent value="requirements">
          {orgId ? <RequirementsPanel orgId={orgId} /> : <LoadingCard />}
        </TabsContent>
        <TabsContent value="attestations">
          {orgId ? <AttestationsPanel orgId={orgId} /> : <LoadingCard />}
        </TabsContent>
      </Tabs>
    </div>
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

function SourcesPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAuthoritativeSources);
  const { data, isLoading } = useQuery({
    queryKey: ["auth-sources", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

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
              <SourceRow key={s.id as string} source={s} orgId={orgId} />
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
}: {
  source: { id: string; title: string; authoritative_kind: string | null; fiscal_year: string | null; effective_start: string | null; effective_end: string | null; file_name: string; uploaded_by_name: string | null; created_at: string; parse_status: string | null };
  orgId: string;
}) {
  const qc = useQueryClient();
  const genFn = useServerFn(generateRequirementsFromSource);
  const generate = useMutation({
    mutationFn: () => genFn({ data: { documentId: source.id } }),
    onSuccess: (r) => {
      toast.success(
        `NECTAR drafted ${r.inserted} requirement${r.inserted === 1 ? "" : "s"} from this source. Review them in the Requirements tab.`,
      );
      qc.invalidateQueries({ queryKey: ["requirements", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("state_sow");
  const [fiscalYear, setFiscalYear] = useState("");
  const [effectiveStart, setEffectiveStart] = useState("");
  const [effectiveEnd, setEffectiveEnd] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const ingest = useServerFn(ingestDocument);
  const mark = useServerFn(markAsAuthoritativeSource);

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
      setFile(null);
      setTitle("");
      setFiscalYear("");
      setEffectiveStart("");
      setEffectiveEnd("");
      if (fileInput.current) fileInput.current.value = "";
      onUploaded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
            placeholder="e.g. Utah DSPD SOW — FY26"
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
          disabled={upload.isPending || !file}
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
      </div>
    </div>
  );
}

// ---------- Requirements panel ----------

function RequirementsPanel({ orgId }: { orgId: string }) {
  const listReqFn = useServerFn(listRequirements);
  const { data, isLoading } = useQuery({
    queryKey: ["requirements", orgId],
    queryFn: () => listReqFn({ data: { organizationId: orgId } }),
  });

  const grouped = useMemo(() => {
    const buckets: { document: any[]; suggestion: any[]; manual: any[] } = {
      document: [],
      suggestion: [],
      manual: [],
    };
    for (const r of data?.requirements ?? []) {
      const k = (r.origin as "document" | "suggestion" | "manual") ?? "manual";
      buckets[k].push(r);
    }
    return buckets;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          NECTAR-organized requirements
        </h2>
        <ManualRequirementDialog orgId={orgId} />
      </div>

      <AttestationBanner
        organizationId={orgId}
        scope="generic"
        mode="nudge"
        compact
        statement="Items below are organized by NECTAR from documents you uploaded. Items without a traced source are surfaced as suggestions and need your confirmation before they're treated as requirements."
      />

      {isLoading && (
        <p className="text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      )}

      <RequirementGroup
        title="Traced to an uploaded source"
        subtitle="Document-backed — citation visible per row"
        items={grouped.document}
        orgId={orgId}
      />
      <RequirementGroup
        title="NECTAR suggestions (unverified)"
        subtitle="Commonly required but not traced to a document you uploaded. Confirm or remove."
        items={grouped.suggestion}
        orgId={orgId}
      />
      <RequirementGroup
        title="Manual entries"
        subtitle="Items you added by hand"
        items={grouped.manual}
        orgId={orgId}
      />
    </div>
  );
}

function RequirementGroup({
  title,
  subtitle,
  items,
  orgId,
}: {
  title: string;
  subtitle: string;
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    origin: string;
    source_citation: string | null;
    verified: boolean;
    verified_at: string | null;
  }>;
  orgId: string;
}) {
  if (!items?.length) return null;
  return (
    <section className="rounded-2xl border border-border/60 bg-background/60 p-4 backdrop-blur">
      <header className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </header>
      <ul className="divide-y divide-border/40">
        {items.map((r) => (
          <RequirementRow key={r.id} req={r} orgId={orgId} />
        ))}
      </ul>
    </section>
  );
}

function RequirementRow({
  req,
  orgId,
}: {
  req: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    origin: string;
    source_citation: string | null;
    verified: boolean;
    verified_at: string | null;
  };
  orgId: string;
}) {
  const qc = useQueryClient();
  const verifyFn = useServerFn(verifyRequirement);
  const delFn = useServerFn(deleteRequirement);
  const verify = useMutation({
    mutationFn: (val: boolean) =>
      verifyFn({
        data: {
          id: req.id,
          verified: val,
          attestStatement: val
            ? `Confirmed requirement "${req.title}" as accurate and applicable to my agency.`
            : undefined,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requirements", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => delFn({ data: { id: req.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requirements", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{req.title}</span>
          {req.category && (
            <Badge variant="outline" className="text-[10px]">
              {req.category}
            </Badge>
          )}
          <SourceCitationChip citation={req.source_citation} />
          {req.verified && (
            <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Confirmed by company
            </Badge>
          )}
        </div>
        {req.description && (
          <p className="mt-1 text-xs text-muted-foreground">{req.description}</p>
        )}
        {req.verified && req.verified_at && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Confirmed {new Date(req.verified_at).toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {req.verified ? (
          <Button size="sm" variant="ghost" onClick={() => verify.mutate(false)}>
            Unconfirm
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-amber-500 text-amber-950 hover:bg-amber-400"
            onClick={() => verify.mutate(true)}
            disabled={verify.isPending}
          >
            Confirm
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => del.mutate()}>
          Remove
        </Button>
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
