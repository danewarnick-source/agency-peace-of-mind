import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { OnboardingReturnBar } from "@/components/onboarding/onboarding-return-bar";
import { OnboardingGuidanceBanner } from "@/components/onboarding/onboarding-guidance-banner";
import {
  Database,
  FileText,
  History,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCaseload } from "@/hooks/use-caseload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NectarGuidanceStrip } from "@/components/nectar/nectar-guidance-strip";
import { NectarDocumentActionsDialog } from "@/components/nectar/document-actions-dialog";
import {
  ingestDocument,
  queryDocuments,
  getDocument,
  reviewExtractedField,
  deleteDocument,
} from "@/lib/nectar-documents.functions";
import { DocumentEffectiveDatingDialog } from "@/components/documents/document-effective-dating-dialog";
import { OutdatedDocumentsSection } from "@/components/documents/outdated-documents-section";


const DOC_TYPES = [
  { value: "all", label: "All types" },
  { value: "pcsp", label: "PCSP" },
  { value: "1056_budget", label: "1056 Budget" },
  { value: "sow", label: "State SOW" },
  { value: "referral", label: "Referral" },
  { value: "intake", label: "Intake" },
  { value: "assessment", label: "Assessment" },
  { value: "certification", label: "Certification" },
  { value: "training", label: "Training" },
  { value: "contract", label: "Contract" },
  { value: "evv_report", label: "EVV report" },
  { value: "timesheet", label: "Timesheet" },
  { value: "incident_report", label: "Incident report" },
  { value: "billing_record", label: "Billing record" },
  { value: "other", label: "Other" },
];

const OWNER_KINDS = [
  { value: "all", label: "All owners" },
  { value: "client", label: "Client" },
  { value: "staff", label: "Staff" },
  { value: "company", label: "Company" },
  { value: "state", label: "State / SOW" },
  { value: "other", label: "Other" },
];

type DocRow = {
  id: string;
  owner_kind: string;
  document_type: string;
  title: string;
  version: number;
  is_current: boolean;
  fiscal_year: string | null;
  tags: string[] | null;
  file_name: string;
  parse_status: string;
  uploaded_by_name: string | null;
  created_at: string;
};

export function NectarDocsPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("all");
  const [ownerKind, setOwnerKind] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [offerDocId, setOfferDocId] = useState<string | null>(null);
  const [dating, setDating] = useState<{ id: string; documentType: string } | null>(null);

  const queryFn = useServerFn(queryDocuments);
  const qc = useQueryClient();
  const { data: caseload } = useCaseload();

  const { data, isLoading } = useQuery({
    queryKey: ["nectar-docs", orgId, search, docType, ownerKind, clientFilter],
    queryFn: () =>
      queryFn({
        data: {
          organizationId: orgId!,
          search: search || undefined,
          documentType: docType === "all" ? undefined : docType,
          ownerKind:
            clientFilter !== "all"
              ? "client"
              : ownerKind === "all"
                ? undefined
                : (ownerKind as never),
          clientId: clientFilter === "all" ? undefined : clientFilter,
          currentOnly: true,
          limit: 200,
        },
      }),
    enabled: !!orgId,
  });

  const docs = (data?.documents ?? []) as DocRow[];

  const stats = useMemo(() => {
    const parsed = docs.filter((d) => d.parse_status === "parsed").length;
    const pending = docs.filter((d) => d.parse_status === "parsing" || d.parse_status === "pending").length;
    return { total: docs.length, parsed, pending };
  }, [docs]);

  return (
    <div className="space-y-4">
      <OnboardingReturnBar />
      <OnboardingGuidanceBanner step={6} />

      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Database className="h-3.5 w-3.5" /> NECTAR · Client &amp; Staff Documents
        </div>
        <h1 className="text-2xl font-semibold">Company Docs</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated view of every client and staff document in the workspace. Files uploaded on a <span className="font-medium text-foreground">client</span> or <span className="font-medium text-foreground">staff profile</span> appear here automatically — no duplicate upload. State and contract authority documents live in <span className="font-medium">Authoritative Sources</span>.
        </p>
      </header>

      <NectarGuidanceStrip
        title="NECTAR parses on upload"
        message={
          <>
            Drop a PCSP, 1056 budget, certification, or any client/staff document. NECTAR extracts
            structured fields (rate, units, dates, clauses) with source locators. An admin always confirms or overrides — the platform proposes, you decide.
          </>
        }
        highlight={stats.pending ? `${stats.pending} parsing` : undefined}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur-md md:flex-row md:items-end md:gap-4">
        <div className="flex-1 space-y-1">
          <Label htmlFor="nectar-search" className="text-xs">Search by title</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="nectar-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="PCSP, SOW FY26…"
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Document type</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Owner</Label>
          <Select value={ownerKind} onValueChange={setOwnerKind}>
            <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OWNER_KINDS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Client</Label>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {(caseload ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <UploadButton
          orgId={orgId}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={(docId, docType) => {
            qc.invalidateQueries({ queryKey: ["nectar-docs"] });
            qc.invalidateQueries({ queryKey: ["outdated-docs"] });
            if (docId) setOfferDocId(docId);
            if (docId && docType) setDating({ id: docId, documentType: docType });
          }}
        />
        <NectarDocumentActionsDialog
          documentId={offerDocId}
          open={!!offerDocId}
          onOpenChange={(v) => { if (!v) setOfferDocId(null); }}
        />
        <DocumentEffectiveDatingDialog
          open={!!dating}
          onOpenChange={(v) => { if (!v) setDating(null); }}
          organizationId={orgId}
          kind="nectar"
          documentId={dating?.id ?? null}
          documentType={dating?.documentType ?? "other"}
          documentTypeLabel={DOC_TYPES.find((t) => t.value === dating?.documentType)?.label}
          clientId={clientFilter !== "all" ? clientFilter : null}
          onDone={() => qc.invalidateQueries({ queryKey: ["outdated-docs"] })}
        />
      </div>



      <div className="grid gap-3">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
          </div>
        )}
        {!isLoading && docs.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-8 text-center text-sm text-muted-foreground">
            No documents yet. Upload a PCSP, SOW or certification to seed NECTAR.
          </div>
        )}
        {docs.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelectedId(d.id)}
            className="group relative flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-4 text-left backdrop-blur-md transition hover:border-primary/40 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary/70" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{d.title}</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{d.document_type.replace(/_/g, " ")}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{d.owner_kind}</Badge>
                  {d.fiscal_year && <Badge variant="outline" className="text-[10px]">{d.fiscal_year}</Badge>}
                  {d.version > 1 && <Badge variant="outline" className="text-[10px]">v{d.version}</Badge>}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {d.file_name} · uploaded {new Date(d.created_at).toLocaleDateString()}{d.uploaded_by_name ? ` by ${d.uploaded_by_name}` : ""}
                </div>
              </div>
            </div>
            <ParseStatusBadge status={d.parse_status} />
          </button>
        ))}
      </div>

      <OutdatedDocumentsSection
        organizationId={orgId}
        kind="nectar"
        title="Outdated Company Docs"
      />


      {selectedId && (
        <DocumentDetailDialog
          documentId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["nectar-docs"] })}
        />
      )}
    </div>
  );
}

function ParseStatusBadge({ status }: { status: string }) {
  if (status === "parsed") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
        <Sparkles className="mr-1 h-3 w-3" /> Parsed
      </Badge>
    );
  }
  if (status === "parsing" || status === "pending") {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> {status}
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">Parse failed</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

// ----------------- Upload Dialog -----------------

function UploadButton({
  orgId,
  open,
  onOpenChange,
  onUploaded,
}: {
  orgId: string | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUploaded: (docId?: string, docType?: string) => void;
}) {
  const ingest = useServerFn(ingestDocument);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("pcsp");
  const [ownerKind, setOwnerKind] = useState("client");
  const [fiscalYear, setFiscalYear] = useState("");
  const [medicaidId, setMedicaidId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!orgId || !file) throw new Error("Pick a file first");
      const b64 = await fileToBase64(file);
      return ingest({
        data: {
          organizationId: orgId,
          ownerKind: ownerKind as never,
          documentType: docType as never,
          title: title || file.name,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileBase64: b64,
          fiscalYear: fiscalYear || null,
          medicaidId: medicaidId || null,
          tags: [],
          autoParse: true,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        `Uploaded — NECTAR extracted ${res.extracted?.length ?? 0} field(s)`,
      );
      const chosenType = docType;
      setTitle(""); setFile(null); setFiscalYear(""); setMedicaidId("");
      onOpenChange(false);
      const docId = (res as { document?: { id?: string } }).document?.id;
      onUploaded(docId, chosenType);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-amber-500 text-amber-950 hover:bg-amber-400">
          <Upload className="h-4 w-4" /> Upload document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload to NECTAR</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>File (PDF, text, CSV)</Label>
            <Input type="file" accept=".pdf,.txt,.csv,.md,.json,.html,.htm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PCSP FY26 — Jane Doe" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.filter((t) => t.value !== "all").map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Owner</Label>
              <Select value={ownerKind} onValueChange={setOwnerKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OWNER_KINDS.filter((t) => t.value !== "all").map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fiscal year</Label>
              <Input value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="FY26" />
            </div>
            <div className="space-y-1">
              <Label>Medicaid ID</Label>
              <Input value={medicaidId} onChange={(e) => setMedicaidId(e.target.value)} placeholder="optional" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!file || mut.isPending}
            onClick={() => mut.mutate()}
            className="bg-amber-500 text-amber-950 hover:bg-amber-400"
          >
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Upload & parse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let str = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(str);
}

// ----------------- Detail Dialog -----------------

function DocumentDetailDialog({
  documentId,
  onClose,
  onChanged,
}: {
  documentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const getFn = useServerFn(getDocument);
  const reviewFn = useServerFn(reviewExtractedField);
  const deleteFn = useServerFn(deleteDocument);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["nectar-doc", documentId],
    queryFn: () => getFn({ data: { documentId } }),
  });

  const review = useMutation({
    mutationFn: (args: { fieldId: string; action: "confirm" | "override" | "reject"; overrideValue?: { value_text?: string } }) =>
      reviewFn({ data: args }),
    onSuccess: () => {
      refetch();
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { documentId } }),
    onSuccess: () => { toast.success("Document deleted"); qc.invalidateQueries({ queryKey: ["nectar-docs"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const doc = data?.document as Record<string, unknown> | undefined;
  const fields = (data?.fields ?? []) as Array<{ id: string; field_key: string; field_group: string | null; value_text: string | null; value_number: number | null; value_date: string | null; source_locator: string | null; confidence: number | null; status: string }>;
  const versions = (data?.versions ?? []) as Array<{ id: string; version: number; is_current: boolean; created_at: string; uploaded_by_name: string | null }>;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary/70" />
            {doc?.title as string ?? "Document"}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !doc ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{(doc.document_type as string).replace(/_/g, " ")}</Badge>
              <Badge variant="secondary">{doc.owner_kind as string}</Badge>
              {doc.fiscal_year ? <Badge variant="outline">{doc.fiscal_year as string}</Badge> : null}
              <Badge variant="outline">v{doc.version as number}</Badge>
              {data?.signedUrl && (
                <a href={data.signedUrl} target="_blank" rel="noreferrer" className="text-primary underline">Open file</a>
              )}
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => del.mutate()}>
                <X className="mr-1 h-3 w-3" /> Delete
              </Button>
            </div>

            <section className="rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur-md">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> Extracted fields
                <span className="text-xs font-normal text-muted-foreground">
                  · NECTAR proposes, admins confirm
                </span>
              </h3>
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">No fields extracted yet.</p>
              ) : (
                <div className="space-y-2">
                  {fields.map((f) => (
                    <div key={f.id} className="rounded-md border border-border/50 bg-background/40 p-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{f.field_key}</span>
                            {f.field_group && <Badge variant="outline" className="text-[10px]">{f.field_group}</Badge>}
                            <FieldStatusBadge status={f.status} />
                          </div>
                          <div className="mt-0.5 text-xs">
                            <span className="font-mono">{f.value_text ?? (f.value_number != null ? String(f.value_number) : f.value_date ?? "—")}</span>
                            {f.source_locator && (
                              <span className="ml-2 text-muted-foreground">· source: {f.source_locator}</span>
                            )}
                            {f.confidence != null && (
                              <span className="ml-2 text-muted-foreground">· {Math.round(f.confidence * 100)}% conf.</span>
                            )}
                          </div>
                        </div>
                        {f.status === "proposed" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-7 bg-amber-500 text-amber-950 hover:bg-amber-400"
                              onClick={() => review.mutate({ fieldId: f.id, action: "confirm" })}
                            >
                              <ShieldCheck className="mr-1 h-3 w-3" /> Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7"
                              onClick={() => {
                                const v = prompt("Override value:", f.value_text ?? "");
                                if (v != null) review.mutate({ fieldId: f.id, action: "override", overrideValue: { value_text: v } });
                              }}
                            >
                              Override
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur-md">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4 text-primary" /> Version history
              </h3>
              <div className="space-y-1 text-xs">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-2 py-1">
                    <span>v{v.version} {v.is_current && <Badge className="ml-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" variant="outline">current</Badge>}</span>
                    <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()} {v.uploaded_by_name ? `· ${v.uploaded_by_name}` : ""}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldStatusBadge({ status }: { status: string }) {
  if (status === "confirmed") return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">confirmed</Badge>;
  if (status === "overridden") return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">overridden</Badge>;
  if (status === "rejected") return <Badge variant="destructive">rejected</Badge>;
  return <Badge variant="outline">proposed</Badge>;
}
