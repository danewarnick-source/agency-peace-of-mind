import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileCheck, FileX, Clock4, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { MySmartImportCertReminders } from "@/components/smart-import/my-cert-reminders";

export const Route = createFileRoute("/dashboard/external-certifications")({ component: ExternalCertsPage });

const CERT_TYPES = ["CPR/First Aid", "SOAR", "MANDT", "PART", "CPI/Safety Care", "Other"];

type ExtCert = {
  id: string;
  user_id: string;
  cert_type: string;
  cert_name: string | null;
  issuer: string | null;
  issued_date: string | null;
  expires_at: string | null;
  file_url: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  reviewer_notes: string | null;
  created_at: string;
};

function ExternalCertsPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const canApprove = can("approve_external_certs");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: mine } = useQuery({
    enabled: !!user,
    queryKey: ["my-ext-certs", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("external_certifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data as ExtCert[]) ?? [];
    },
  });

  const { data: orgCerts } = useQuery({
    enabled: !!org && canApprove,
    queryKey: ["org-ext-certs", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("external_certifications")
        .select("*")
        .eq("organization_id", org!.organization_id)
        .order("created_at", { ascending: false });
      const rows = (data as ExtCert[]) ?? [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      let profileMap = new Map<string, { full_name: string | null; email: string }>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("org_member_directory")
          .select("id, full_name, email")
          .in("id", userIds);
        profileMap = new Map((profs ?? []).filter((p) => !!p.id).map((p) => [p.id as string, { full_name: p.full_name, email: p.email ?? "" }]));
      }
      return rows.map((r) => ({ ...r, profiles: profileMap.get(r.user_id) ?? null }));
    },
  });
  const orgCertsFallback = orgCerts;

  const review = useMutation({
    mutationFn: async (args: { id: string; status: "approved" | "rejected"; notes?: string }) => {
      const { error } = await supabase
        .from("external_certifications")
        .update({
          status: args.status,
          reviewer_id: user!.id,
          reviewer_notes: args.notes ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["org-ext-certs"] });
      qc.invalidateQueries({ queryKey: ["org-ext-certs-fallback"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <MySmartImportCertReminders />
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] flex flex-wrap items-center justify-between gap-3">

        <div>
          <h2 className="text-base font-semibold">External Certifications</h2>
          <p className="text-sm text-muted-foreground">
            Upload certifications earned outside the platform (CPR, MANDT, SOAR, PART, CPI). Admins review and approve.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[image:var(--gradient-brand)] text-primary-foreground">
              <Upload className="mr-2 h-4 w-4" /> Upload certification
            </Button>
          </DialogTrigger>
          <UploadDialog onClose={() => setOpen(false)} />
        </Dialog>
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My certifications</TabsTrigger>
          {canApprove && <TabsTrigger value="review">Pending review</TabsTrigger>}
          {canApprove && <TabsTrigger value="org">All org certifications</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-4">
          <CertList rows={mine ?? []} emptyText="You haven't uploaded any certifications yet." />
        </TabsContent>

        {canApprove && (
          <TabsContent value="review" className="mt-4">
            <CertList
              rows={(orgCerts ?? orgCertsFallback ?? []).filter((c) => c.status === "pending")}
              emptyText="No pending certifications."
              showOwner
              onApprove={(id) => review.mutate({ id, status: "approved" })}
              onReject={(id, notes) => review.mutate({ id, status: "rejected", notes })}
            />
          </TabsContent>
        )}
        {canApprove && (
          <TabsContent value="org" className="mt-4">
            <CertList rows={orgCerts ?? orgCertsFallback ?? []} emptyText="No certifications uploaded yet." showOwner />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function statusBadge(status: ExtCert["status"], expires_at: string | null) {
  const expiringSoon = expires_at && new Date(expires_at).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
  if (status === "approved") {
    if (expires_at && new Date(expires_at) < new Date())
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Expired</Badge>;
    if (expiringSoon)
      return <Badge className="gap-1 bg-amber-500/15 text-amber-600"><Clock4 className="h-3 w-3" /> Expiring soon</Badge>;
    return <Badge className="gap-1 bg-success/15 text-success"><FileCheck className="h-3 w-3" /> Approved</Badge>;
  }
  if (status === "rejected") return <Badge variant="destructive" className="gap-1"><FileX className="h-3 w-3" /> Rejected</Badge>;
  if (status === "expired") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Expired</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock4 className="h-3 w-3" /> Pending</Badge>;
}

function CertList({
  rows, emptyText, showOwner, onApprove, onReject,
}: {
  rows: (ExtCert & { profiles?: { full_name: string | null; email: string } | null })[];
  emptyText: string;
  showOwner?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string, notes: string) => void;
}) {
  if (!rows.length)
    return <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{emptyText}</div>;
  return (
    <div className="grid gap-3">
      {rows.map((c) => (
        <div key={c.id} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{c.cert_type}</h3>
                {statusBadge(c.status, c.expires_at)}
              </div>
              {c.cert_name && <p className="text-sm text-muted-foreground">{c.cert_name}</p>}
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {showOwner && c.profiles && <span>Owner: {c.profiles.full_name ?? c.profiles.email}</span>}
                {c.issuer && <span>Issuer: {c.issuer}</span>}
                {c.issued_date && <span>Issued: {new Date(c.issued_date).toLocaleDateString()}</span>}
                {c.expires_at && <span>Expires: {new Date(c.expires_at).toLocaleDateString()}</span>}
              </div>
              {c.reviewer_notes && (
                <p className="mt-2 text-xs text-muted-foreground italic">Reviewer note: {c.reviewer_notes}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {c.file_url && (
                <Button asChild variant="outline" size="sm">
                  <a href={c.file_url} target="_blank" rel="noreferrer"><Download className="mr-1 h-3 w-3" /> View file</a>
                </Button>
              )}
              {onApprove && c.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onApprove(c.id)} className="bg-success text-success-foreground hover:bg-success/90">Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => {
                    const notes = window.prompt("Reason for rejection?") ?? "";
                    onReject?.(c.id, notes);
                  }}>Reject</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UploadDialog({ onClose, targetUserId }: { onClose: () => void; targetUserId?: string }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [certType, setCertType] = useState(CERT_TYPES[0]);
  const [certName, setCertName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!user || !org) throw new Error("Missing context");
      if (!file) throw new Error("Please attach a certificate file");
      const ownerId = targetUserId ?? user.id;
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("certificates").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("certificates").createSignedUrl(path, 60 * 60 * 24 * 365);
      const { error } = await supabase.from("external_certifications").insert({
        user_id: ownerId,
        organization_id: org.organization_id,
        cert_type: certType,
        cert_name: certName || null,
        issuer: issuer || null,
        issued_date: issuedDate || null,
        expires_at: expiresAt || null,
        file_url: signed?.signedUrl ?? null,
        reviewer_notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certification submitted for review");
      qc.invalidateQueries({ queryKey: ["my-ext-certs"] });
      qc.invalidateQueries({ queryKey: ["org-ext-certs"] });
      qc.invalidateQueries({ queryKey: ["staff-checklist"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Upload external certification</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Certification type</Label>
          <Select value={certType} onValueChange={setCertType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CERT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Name on certificate</Label>
          <Input value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="e.g., Adult & Pediatric CPR" />
        </div>
        <div>
          <Label>Issuing organization</Label>
          <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="e.g., American Red Cross" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Issued date</Label>
            <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
          </div>
          <div>
            <Label>Expires</Label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Certificate file (PDF or image)</Label>
          <Input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submit.isPending} onClick={() => submit.mutate()} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
          {submit.isPending ? "Uploading…" : "Submit for review"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
