import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  Sparkles,
  Upload,
  ExternalLink,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import {
  ingestDocument,
  queryDocuments,
  deleteDocument,
} from "@/lib/nectar-documents.functions";
import { attachClientDocument } from "@/lib/import-checklist.functions";
import { NectarDocumentActionsDialog } from "@/components/nectar/document-actions-dialog";

const CLIENT_DOC_TYPES = [
  { value: "pcsp", label: "PCSP" },
  { value: "1056_budget", label: "1056 Budget" },
  { value: "referral", label: "Referral" },
  { value: "intake", label: "Intake form" },
  { value: "assessment", label: "Assessment" },
  { value: "contract", label: "Guardian / legal papers" },
  { value: "certification", label: "Consent" },
  { value: "other", label: "Other" },
];

type DocRow = {
  id: string;
  document_type: string;
  title: string;
  version: number;
  fiscal_year: string | null;
  file_name: string;
  parse_status: string;
  uploaded_by_name: string | null;
  created_at: string;
  source: "nectar" | "client";
  storage_path?: string;
};

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

export function ClientDocumentsCard({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const queryFn = useServerFn(queryDocuments);
  const delFn = useServerFn(deleteDocument);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [offerDocId, setOfferDocId] = useState<string | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["client-docs", orgId, clientId] });
    qc.invalidateQueries({ queryKey: ["nectar-docs"] });
    qc.invalidateQueries({ queryKey: ["client-has-pcsp", clientId] });
    qc.invalidateQueries({ queryKey: ["client-specific-training", clientId] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["client-docs", orgId, clientId],
    enabled: !!orgId && !!clientId,
    queryFn: async () => {
      const [nectarRes, clientRes] = await Promise.all([
        queryFn({
          data: {
            organizationId: orgId!,
            clientId,
            ownerKind: "client",
            currentOnly: true,
            limit: 100,
          },
        }),
        supabase
          .from("client_documents")
          .select("id, document_type, file_name, storage_path, file_url, uploaded_at, created_at")
          .eq("client_id", clientId)
          .order("uploaded_at", { ascending: false }),
      ]);
      const nectarDocs: DocRow[] = (nectarRes?.documents ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        document_type: (d.document_type as string) ?? "other",
        title: (d.title as string) ?? (d.file_name as string) ?? "Document",
        version: (d.version as number) ?? 1,
        fiscal_year: (d.fiscal_year as string | null) ?? null,
        file_name: (d.file_name as string) ?? "",
        parse_status: (d.parse_status as string) ?? "",
        uploaded_by_name: (d.uploaded_by_name as string | null) ?? null,
        created_at: (d.created_at as string) ?? new Date().toISOString(),
        source: "nectar",
      }));
      const clientDocs: DocRow[] = ((clientRes.data ?? []) as Array<Record<string, unknown>>).map((d) => ({
        id: d.id as string,
        document_type: ((d.document_type as string) ?? "other").toLowerCase(),
        title: ((d.document_type as string) ?? "Document").toUpperCase() + " — " + clientName,
        version: 1,
        fiscal_year: null,
        file_name: (d.file_name as string) ?? "",
        parse_status: "",
        uploaded_by_name: null,
        created_at: ((d.uploaded_at as string) ?? (d.created_at as string) ?? new Date().toISOString()),
        source: "client",
        storage_path: ((d.storage_path as string) ?? (d.file_url as string)) ?? "",
      }));
      const merged = [...nectarDocs, ...clientDocs].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      );
      return { documents: merged };
    },
  });

  const docs = (data?.documents ?? []) as DocRow[];

  const del = useMutation({
    mutationFn: async (row: DocRow) => {
      if (row.source === "client") {
        if (row.storage_path) {
          await supabase.storage.from("client-documents").remove([row.storage_path]).catch(() => null);
        }
        const { error } = await supabase.from("client_documents").delete().eq("id", row.id);
        if (error) throw error;
        return;
      }
      await delFn({ data: { documentId: row.id } });
    },
    onSuccess: () => {
      toast.success("Document removed");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Client Documents
          </CardTitle>
          <UploadDocDialog
            orgId={orgId}
            clientId={clientId}
            clientName={clientName}
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            onUploaded={(docId) => {
              qc.invalidateQueries({ queryKey: ["client-docs", orgId, clientId] });
              qc.invalidateQueries({ queryKey: ["nectar-docs"] });
              if (docId) setOfferDocId(docId);
            }}
          />
          <NectarDocumentActionsDialog
            documentId={offerDocId}
            open={!!offerDocId}
            onOpenChange={(v) => { if (!v) setOfferDocId(null); }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Guardian papers, PCSP, 1056, intake/referrals, assessments, consents.
          NECTAR parses each file on upload — billing fields from a PCSP/1056
          flow into the billing layer; the file itself stays here and appears in{" "}
          <span className="font-medium text-foreground">Company Docs</span> tagged
          to {clientName}.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/30 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && docs.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/30 p-4 text-center text-xs text-muted-foreground">
            No client documents yet. Upload a PCSP, 1056, or intake to seed
            NECTAR for {clientName}.
          </div>
        )}
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur-md md:flex-row md:items-center md:justify-between"
          >
            <div className="flex min-w-0 items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{d.title}</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {d.document_type.replace(/_/g, " ")}
                  </Badge>
                  {d.fiscal_year && (
                    <Badge variant="outline" className="text-[10px]">{d.fiscal_year}</Badge>
                  )}
                  {d.version > 1 && (
                    <Badge variant="outline" className="text-[10px]">v{d.version}</Badge>
                  )}
                  <ParseStatus status={d.parse_status} />
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {d.file_name} · {new Date(d.created_at).toLocaleDateString()}
                  {d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() => window.open(`/dashboard/nectar-docs?doc=${d.id}`, "_blank")}
              >
                <ExternalLink className="h-3 w-3" /> Open
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-destructive"
                onClick={() => {
                  if (confirm(`Remove "${d.title}"?`)) del.mutate(d.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ParseStatus({ status }: { status: string }) {
  if (status === "parsed")
    return (
      <Badge className="bg-emerald-500/15 text-[10px] text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
        <Sparkles className="mr-1 h-2.5 w-2.5" /> parsed
      </Badge>
    );
  if (status === "parsing" || status === "pending")
    return (
      <Badge className="bg-amber-500/15 text-[10px] text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
        <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> {status}
      </Badge>
    );
  if (status === "failed") return <Badge variant="destructive" className="text-[10px]">parse failed</Badge>;
  return null;
}

function UploadDocDialog({
  orgId,
  clientId,
  clientName,
  open,
  onOpenChange,
  onUploaded,
}: {
  orgId: string | undefined;
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUploaded: (docId?: string) => void;
}) {
  const ingest = useServerFn(ingestDocument);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("pcsp");
  const [fiscalYear, setFiscalYear] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const defaultTitle = useMemo(() => {
    const t = CLIENT_DOC_TYPES.find((x) => x.value === docType)?.label ?? "Document";
    return `${t} — ${clientName}`;
  }, [docType, clientName]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!orgId || !file) throw new Error("Pick a file first");
      const b64 = await fileToBase64(file);
      return ingest({
        data: {
          organizationId: orgId,
          ownerKind: "client",
          clientId,
          documentType: docType as never,
          title: title || defaultTitle,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileBase64: b64,
          fiscalYear: fiscalYear || null,
          tags: [],
          autoParse: true,
        },
      });
    },
    onSuccess: (res) => {
      const r = res as {
        document?: { id?: string };
        extracted?: unknown[];
        autofilled?: string[];
        suggested?: string[];
      };
      const extractedN = r.extracted?.length ?? 0;
      const autoN = r.autofilled?.length ?? 0;
      const sugN = r.suggested?.length ?? 0;
      toast.success(
        autoN > 0
          ? `NECTAR autofilled ${autoN} field${autoN === 1 ? "" : "s"} on ${clientName}'s profile${sugN > 0 ? ` · ${sugN} need review` : ""}`
          : `Uploaded — NECTAR extracted ${extractedN} field${extractedN === 1 ? "" : "s"}${sugN > 0 ? ` · ${sugN} need review` : ""}`,
      );
      setTitle(""); setFile(null); setFiscalYear("");
      onOpenChange(false);
      onUploaded(r.document?.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1.5 bg-amber-500 text-amber-950 hover:bg-amber-400">
          <Upload className="h-3.5 w-3.5" /> Upload document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload to {clientName}'s record</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>File (PDF, text, CSV)</Label>
            <Input
              type="file"
              accept=".pdf,.txt,.csv,.md,.json,.html,.htm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1">
            <Label>Document type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLIENT_DOC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={defaultTitle}
              />
            </div>
            <div className="space-y-1">
              <Label>Fiscal year</Label>
              <Input
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                placeholder="FY26"
              />
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
            {mut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Upload &amp; parse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
