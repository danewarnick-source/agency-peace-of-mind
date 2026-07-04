import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { RequireCapability } from "@/hooks/use-exec-capability";
import { getOrgAgreements, upsertOrgAgreement, type AgreementStatus, type OrgAgreementChecklistItem } from "@/lib/agreements.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/dashboard/hive-exec/agreements/$orgId")({
  head: () => ({ meta: [{ title: "Organization Agreements — Executive Command Center" }] }),
  component: () => (
    <RequireCapability cap="agreements.read">
      <OrgAgreementsPage />
    </RequireCapability>
  ),
});

function OrgAgreementsPage() {
  const { orgId } = Route.useParams();
  const listFn = useServerFn(getOrgAgreements);
  const q = useQuery({
    queryKey: ["org-agreements", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  return (
    <div className="space-y-4">
      <Link to="/dashboard/hive-exec/agreements" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to matrix
      </Link>
      <h1 className="font-display text-lg font-semibold text-[#0f1b3d]">Organization Agreements</h1>

      {q.isLoading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>}

      <div className="space-y-3">
        {(q.data ?? []).map((item) => (
          <AgreementRow key={item.id} orgId={orgId} item={item} />
        ))}
      </div>
    </div>
  );
}

function AgreementRow({ orgId, item }: { orgId: string; item: OrgAgreementChecklistItem }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertOrgAgreement);
  const a = item.agreement;
  const [form, setForm] = useState({
    status: (a?.status ?? "not_started") as AgreementStatus,
    file_path: a?.file_path ?? "",
    signed_date: a?.signed_date ?? "",
    expiration_date: a?.expiration_date ?? "",
    renewal_due_date: a?.renewal_due_date ?? "",
    notes: a?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          organization_id: orgId,
          requirement_id: item.id,
          status: form.status,
          file_path: form.file_path || null,
          signed_date: form.signed_date || null,
          expiration_date: form.expiration_date || null,
          renewal_due_date: form.renewal_due_date || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-agreements", orgId] });
      toast.success("Saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const border =
    item.attention === "overdue" ? "border-[#fecaca]" : item.attention === "expiring_soon" ? "border-[#fed7aa]" : "border-border";

  return (
    <section className={`rounded-xl border ${border} bg-card p-4 shadow-sm`}>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{item.name}</h2>
          {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
        </div>
        {item.attention && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.attention === "overdue" ? "bg-[#fecaca] text-[#7f1d1d]" : "bg-[#fef3c7] text-[#78350f]"}`}>
            {item.attention === "overdue" ? "Overdue" : "Expiring soon"}
          </span>
        )}
      </header>

      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AgreementStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="signed">Signed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Signed date</label>
          <Input type="date" value={form.signed_date} onChange={(e) => setForm({ ...form, signed_date: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Expiration</label>
          <Input type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Renewal due</label>
          <Input type="date" value={form.renewal_due_date} onChange={(e) => setForm({ ...form, renewal_due_date: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Document URL</label>
          <Input placeholder="https://…" value={form.file_path} onChange={(e) => setForm({ ...form, file_path: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Notes</label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-1 h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </section>
  );
}
