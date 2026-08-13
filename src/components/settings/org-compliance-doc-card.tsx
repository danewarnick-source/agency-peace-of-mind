// Generic org-level ("company") compliance document card: upload slot +
// optional manual expiration date + missing/expiring flag. Used for the OL
// Residential Support License, OL Residential Support Certification, and
// USOR Approved Vendor cards (prompts 18/19/23).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { ingestDocument, queryDocuments } from "@/lib/nectar-documents.functions";

const DAY = 86_400_000;
const EXPIRING_SOON_DAYS = 60;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export type OrgComplianceDocFlagState = "ok" | "missing" | "expiring" | "expired";

export function computeDocFlag(effectiveEnd: string | null, hasDoc: boolean): OrgComplianceDocFlagState {
  if (!hasDoc) return "missing";
  if (!effectiveEnd) return "ok";
  const now = Date.now();
  const exp = new Date(`${effectiveEnd}T23:59:59`).getTime();
  if (exp < now) return "expired";
  if (exp - now <= EXPIRING_SOON_DAYS * DAY) return "expiring";
  return "ok";
}

export function OrgComplianceDocCard({
  title,
  subtitle,
  documentType,
  hasExpiration = true,
  footer,
  attestation,
}: {
  title: string;
  subtitle: string;
  documentType: "ol_residential_license" | "ol_residential_certification" | "usor_approved_vendor";
  hasExpiration?: boolean;
  footer?: React.ReactNode;
  attestation?: {
    text: string;
    attestedAt: string | null;
    deadline: Date | null;
    busy: boolean;
    onAttest: () => void;
  };
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const queryFn = useServerFn(queryDocuments);
  const ingestFn = useServerFn(ingestDocument);
  const [uploadOpen, setUploadOpen] = useState(false);

  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["org-compliance-doc", orgId, documentType],
    queryFn: () => queryFn({
      data: { organizationId: orgId!, ownerKind: "company", documentType, currentOnly: true, limit: 5 },
    }),
  });

  const doc = (q.data?.documents ?? [])[0] as {
    id: string; file_name: string; effective_end: string | null; created_at: string; storage_path?: string;
  } | undefined;

  const flag = useMemo(() => {
    const base = hasExpiration ? computeDocFlag(doc?.effective_end ?? null, !!doc) : (doc ? "ok" : "missing");
    if (attestation && !attestation.attestedAt && base === "ok") return "missing";
    return base;
  }, [doc, hasExpiration, attestation]);

  const openDoc = async () => {
    if (!doc?.storage_path) return;
    const { data, error } = await supabase.storage.from("nectar-documents").createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) { toast.error("Could not open document."); return; }
    window.open(data.signedUrl, "_blank");
  };

  const setExpiration = useMutation({
    mutationFn: async (effectiveEnd: string) => {
      if (!doc) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("nectar_documents")
        .update({ effective_end: effectiveEnd || null })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expiration date updated.");
      qc.invalidateQueries({ queryKey: ["org-compliance-doc", orgId, documentType] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className={flag === "expired" || flag === "missing" ? "border-rose-300" : flag === "expiring" ? "border-amber-300" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <FlagBadge flag={flag} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {doc ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <button type="button" className="truncate text-left hover:underline hover:text-[#137182]" onClick={openDoc}>
                {doc.file_name}
              </button>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">Uploaded {fmtDate(doc.created_at.slice(0, 10))}</p>
            {hasExpiration && (
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Expiration date</Label>
                <Input
                  type="date"
                  className="h-8 w-40"
                  defaultValue={doc.effective_end ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (doc.effective_end ?? "")) setExpiration.mutate(e.target.value);
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No document on file.</p>
        )}
        <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <Upload className="mr-1 h-3.5 w-3.5" /> {doc ? "Replace document" : "Upload document"}
        </Button>

        {attestation && (
          <div className="rounded-md border border-border/60 p-3 space-y-1">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={!!attestation.attestedAt}
                disabled={!!attestation.attestedAt || attestation.busy}
                onCheckedChange={(v) => { if (v) attestation.onAttest(); }}
              />
              <span>{attestation.text}</span>
            </label>
            {attestation.attestedAt ? (
              <p className="text-xs text-muted-foreground pl-6">Attested {fmtDate(attestation.attestedAt.slice(0, 10))}</p>
            ) : attestation.deadline ? (
              <p className="text-xs text-muted-foreground pl-6">Due {fmtDate(attestation.deadline.toISOString().slice(0, 10))}</p>
            ) : null}
          </div>
        )}
        {footer}
      </CardContent>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        orgId={orgId}
        documentType={documentType}
        title={title}
        hasExpiration={hasExpiration}
        ingestFn={ingestFn}
        onUploaded={() => {
          qc.invalidateQueries({ queryKey: ["org-compliance-doc", orgId, documentType] });
          setUploadOpen(false);
        }}
      />
    </Card>
  );
}

function FlagBadge({ flag }: { flag: OrgComplianceDocFlagState }) {
  if (flag === "ok") {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3 w-3" />On file</Badge>;
  }
  if (flag === "missing") {
    return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100"><AlertTriangle className="mr-1 h-3 w-3" />Missing</Badge>;
  }
  if (flag === "expired") {
    return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100"><AlertTriangle className="mr-1 h-3 w-3" />Expired</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100"><AlertTriangle className="mr-1 h-3 w-3" />Expiring soon</Badge>;
}

function UploadDialog({
  open, onOpenChange, orgId, documentType, title, hasExpiration, ingestFn, onUploaded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string | undefined;
  documentType: string;
  title: string;
  hasExpiration: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ingestFn: any;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [expiration, setExpirationDate] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!orgId || !file) throw new Error("Pick a file first");
      const b64 = await fileToBase64(file);
      return ingestFn({
        data: {
          organizationId: orgId,
          ownerKind: "company",
          documentType,
          title,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileBase64: b64,
          effectiveEnd: hasExpiration ? (expiration || null) : null,
          tags: [],
          autoParse: false,
        },
      });
    },
    onSuccess: () => {
      toast.success("Uploaded.");
      setFile(null); setExpirationDate("");
      onUploaded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Upload — {title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>File</Label>
            <Input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {hasExpiration && (
            <div className="space-y-1">
              <Label>Expiration date</Label>
              <Input type="date" value={expiration} onChange={(e) => setExpirationDate(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!file || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
