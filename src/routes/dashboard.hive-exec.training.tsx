import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Search, Download, Mail, Phone } from "lucide-react";
import { RequireHiveExecutive } from "@/components/hive-executive-guard";
import { NectarCard, NectarHeader, NectarBadge } from "@/components/nectar/nectar-brand";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAllTrainingEnrollmentsForExec,
  markTrainingLinkSent,
  markTrainingCompleted,
  remindAdminForCertificate,
  bulkUpdateEnrollments,
  manuallyVerifyEnrollment,
  type ExecEnrollmentRow,
  type EnrollmentStatus,
} from "@/lib/training-enrollments.functions";

export const Route = createFileRoute("/dashboard/hive-exec/training")({
  head: () => ({ meta: [{ title: "Training Fulfillment — Provider Interface Exec" }] }),
  component: () => (
    <RequireHiveExecutive>
      <TrainingFulfillmentPage />
    </RequireHiveExecutive>
  ),
});

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  enrolled: "Enrolled",
  link_sent: "Link sent",
  completed: "Completed",
  certificate_pending: "Cert pending",
  certificate_uploaded: "Cert uploaded",
  verified: "Verified",
  cancelled: "Cancelled",
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function statusTimestamp(r: ExecEnrollmentRow): string {
  return (
    r.certificate_uploaded_at ??
    r.completed_at ??
    r.link_sent_at ??
    r.enrolled_at
  );
}

function toCsv(rows: ExecEnrollmentRow[]): string {
  const header = ["Org", "Staff", "Email", "Phone", "Product", "Status", "Enrolled", "Verified", "Cert expires"];
  const lines = rows.map((r) =>
    [
      r.org_name,
      r.staff_name,
      r.staff_email,
      r.staff_phone ?? "",
      r.product_name,
      STATUS_LABEL[r.status],
      r.enrolled_at,
      r.verified_at ?? "",
      r.nectar_extracted_expires_date ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function TrainingFulfillmentPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [orgQuery, setOrgQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewId, setReviewId] = useState<string | null>(null);

  const listFn = useServerFn(getAllTrainingEnrollmentsForExec);
  const listQ = useQuery({
    queryKey: ["hive-exec-training-enrollments"],
    queryFn: () => listFn(),
    refetchInterval: 30000,
  });

  const linkSentFn = useServerFn(markTrainingLinkSent);
  const completedFn = useServerFn(markTrainingCompleted);
  const remindFn = useServerFn(remindAdminForCertificate);
  const bulkFn = useServerFn(bulkUpdateEnrollments);
  const manualVerifyFn = useServerFn(manuallyVerifyEnrollment);

  const rows = listQ.data ?? [];

  const products = useMemo(
    () => Array.from(new Set(rows.map((r) => r.product_name))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = orgQuery.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (productFilter !== "all" && r.product_name !== productFilter) return false;
      if (term && !r.org_name.toLowerCase().includes(term) && !r.staff_name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, statusFilter, productFilter, orgQuery]);

  const summary = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return {
      needsAction: rows.filter((r) => r.status === "certificate_pending" || (r.status === "link_sent" && daysSince(statusTimestamp(r)) > 3)).length,
      awaitingTraining: rows.filter((r) => r.status === "enrolled" || r.status === "link_sent").length,
      awaitingCert: rows.filter((r) => r.status === "certificate_pending").length,
      verifiedThisMonth: rows.filter((r) => r.verified_at && new Date(r.verified_at).getTime() >= startOfMonth).length,
    };
  }, [rows]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["hive-exec-training-enrollments"] });

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(filtered.map((r) => r.id)) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectedRows = filtered.filter((r) => selected.has(r.id));
  const selectedStatuses = new Set(selectedRows.map((r) => r.status));
  const uniformStatus = selectedStatuses.size === 1 ? [...selectedStatuses][0] : null;

  const runBulk = async (action: "mark_link_sent" | "mark_completed_and_notify_admins" | "remind_admins") => {
    if (!selectedRows.length) return;
    const label =
      action === "mark_link_sent" ? "mark all as link sent" :
      action === "mark_completed_and_notify_admins" ? "mark all completed and notify admins" :
      "remind all admins";
    if (!window.confirm(`Confirm: ${label} for ${selectedRows.length} enrollment(s)?`)) return;
    try {
      const r = await bulkFn({ data: { enrollment_ids: [...selected], action } });
      toast.success(`${r.succeeded} succeeded${r.failed ? `, ${r.failed} failed` : ""}`);
      setSelected(new Set());
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const exportCsv = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hive-training-fulfillment.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <NectarHeader
        surface="navy"
        eyebrow="HIVE Platform Operations"
        title="Training Fulfillment"
        description="Send training links, mark completions, and review uploaded certificates across every provider."
        right={<NectarBadge size="sm" label="EXEC ONLY" />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Needs action" value={summary.needsAction} accent="rose" />
        <SummaryCard label="Awaiting training" value={summary.awaitingTraining} accent="amber" />
        <SummaryCard label="Awaiting certificate" value={summary.awaitingCert} accent="violet" />
        <SummaryCard label="Verified this month" value={summary.verifiedThisMonth} accent="emerald" />
      </div>

      <NectarCard className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={orgQuery} onChange={(e) => setOrgQuery(e.target.value)} placeholder="Search org or staff…" className="h-8 pl-7 text-xs w-56" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {products.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>

        {selectedRows.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs">
            <span className="font-medium">{selectedRows.length} selected</span>
            {uniformStatus === "enrolled" && (
              <Button size="sm" onClick={() => runBulk("mark_link_sent")}>Mark all as link sent</Button>
            )}
            {uniformStatus === "link_sent" && (
              <Button size="sm" onClick={() => runBulk("mark_completed_and_notify_admins")}>Mark all completed + notify admins</Button>
            )}
            {uniformStatus === "certificate_pending" && (
              <Button size="sm" onClick={() => runBulk("remind_admins")}>Remind all admins</Button>
            )}
            {!uniformStatus && (
              <span className="text-muted-foreground">Select rows with the same status to use bulk actions.</span>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-8 py-2">
                  <Checkbox
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onCheckedChange={(c) => toggleAll(!!c)}
                  />
                </th>
                <th className="py-2 pr-3">Org</th>
                <th className="py-2 pr-3">Staff</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Days in status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No enrollments match these filters.</td></tr>
              ) : (
                filtered.map((r) => {
                  const days = daysSince(statusTimestamp(r));
                  const dayColor = days > 7 ? "text-destructive font-semibold" : days > 3 ? "text-amber-600 font-medium" : "text-muted-foreground";
                  return (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="py-2"><Checkbox checked={selected.has(r.id)} onCheckedChange={(c) => toggleOne(r.id, !!c)} /></td>
                      <td className="py-2 pr-3 font-medium">{r.org_name}</td>
                      <td className="py-2 pr-3">{r.staff_name}</td>
                      <td className="py-2 pr-3">
                        <a href={`mailto:${r.staff_email}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                          <Mail className="h-3 w-3" />{r.staff_email}
                        </a>
                      </td>
                      <td className="py-2 pr-3">
                        {r.staff_phone ? (
                          <a href={`tel:${r.staff_phone}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                            <Phone className="h-3 w-3" />{r.staff_phone}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-3">{r.product_name}</td>
                      <td className="py-2 pr-3">
                        <NectarBadge size="sm" label={STATUS_LABEL[r.status]} />
                      </td>
                      <td className={`py-2 pr-3 ${dayColor}`}>{days}d</td>
                      <td className="py-2 pr-3">
                        <RowActions
                          row={r}
                          onSendLink={async () => { await linkSentFn({ data: { enrollment_id: r.id } }); invalidate(); }}
                          onMarkComplete={async () => { await completedFn({ data: { enrollment_id: r.id } }); invalidate(); }}
                          onRemind={async () => { await remindFn({ data: { enrollment_id: r.id } }); invalidate(); }}
                          onReview={() => setReviewId(r.id)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </NectarCard>

      {reviewId && (
        <ReviewPanel
          row={rows.find((r) => r.id === reviewId) ?? null}
          onClose={() => setReviewId(null)}
          onConfirmManually={async (expiresOn) => {
            await manualVerifyFn({ data: { enrollment_id: reviewId, expires_on: expiresOn } });
            invalidate();
            setReviewId(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: "rose" | "amber" | "violet" | "emerald" }) {
  const colors: Record<string, string> = {
    rose: "border-rose-400/50 bg-rose-500/5 text-rose-700",
    amber: "border-amber-400/50 bg-amber-500/5 text-amber-700",
    violet: "border-violet-400/50 bg-violet-500/5 text-violet-700",
    emerald: "border-emerald-400/50 bg-emerald-500/5 text-emerald-700",
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[accent]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}

function RowActions({
  row,
  onSendLink,
  onMarkComplete,
  onRemind,
  onReview,
}: {
  row: ExecEnrollmentRow;
  onSendLink: () => Promise<void>;
  onMarkComplete: () => Promise<void>;
  onRemind: () => Promise<void>;
  onReview: () => void;
}) {
  const [working, setWorking] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    try {
      setWorking(true);
      await fn();
      toast.success("Updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  if (row.status === "enrolled") {
    return <Button size="sm" variant="outline" disabled={working} onClick={() => run(onSendLink)}>Send link</Button>;
  }
  if (row.status === "link_sent") {
    return (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={working} onClick={() => run(onMarkComplete)}>Mark complete</Button>
        <Button size="sm" variant="ghost" disabled={working} onClick={() => run(onSendLink)}>Resend</Button>
      </div>
    );
  }
  if (row.status === "certificate_pending") {
    return <Button size="sm" variant="outline" disabled={working} onClick={() => run(onRemind)}>Remind admin</Button>;
  }
  if (row.status === "certificate_uploaded") {
    return <Button size="sm" variant="outline" onClick={onReview}>Review</Button>;
  }
  if (row.status === "verified") {
    return <span className="text-muted-foreground">{row.nectar_extracted_expires_date ? `Expires ${row.nectar_extracted_expires_date}` : "Verified"}</span>;
  }
  return <span className="text-muted-foreground">—</span>;
}

function ReviewPanel({
  row,
  onClose,
  onConfirmManually,
}: {
  row: ExecEnrollmentRow | null;
  onClose: () => void;
  onConfirmManually: (expiresOn: string | null) => Promise<void>;
}) {
  const [expiresOn, setExpiresOn] = useState("");
  if (!row) return null;
  const failed = row.nectar_validation_status === "failed";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-accent" />
          <h3 className="font-semibold">{row.staff_name} — {row.product_name}</h3>
        </div>
        <div className="space-y-2 text-sm">
          <div>Nectar validation: <span className={failed ? "text-destructive font-medium" : "text-emerald-600 font-medium"}>{row.nectar_validation_status ?? "—"}</span></div>
          {row.nectar_extracted_expires_date && <div>Extracted expiration: {row.nectar_extracted_expires_date}</div>}
        </div>
        {failed && (
          <div className="mt-4 space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Nectar rejected this certificate. If you've reviewed it manually and it's valid, confirm it here.</p>
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="h-8 text-xs" />
            <Button size="sm" onClick={() => onConfirmManually(expiresOn || null)}>Confirm manually</Button>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
