import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GraduationCap, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getStaffTrainingEnrollments,
  uploadTrainingCertificate,
  type StaffEnrollmentRow,
  type EnrollmentStatus,
} from "@/lib/training-enrollments.functions";
import { createHrDocumentUploadUrl } from "@/lib/hr-staff.functions";

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  enrolled: "Enrolled",
  link_sent: "Link sent",
  completed: "Completed",
  certificate_pending: "Awaiting certificate",
  certificate_uploaded: "Certificate uploaded",
  verified: "Verified",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<EnrollmentStatus, string> = {
  enrolled: "border-muted-foreground/40 text-muted-foreground",
  link_sent: "border-sky-500/50 text-sky-700",
  completed: "border-violet-500/50 text-violet-700",
  certificate_pending: "border-amber-500/50 text-amber-700",
  certificate_uploaded: "border-violet-500/50 text-violet-700",
  verified: "border-emerald-500/50 text-emerald-700",
  cancelled: "border-destructive/50 text-destructive",
};

export function StaffTrainingEnrollmentsCard({
  organizationId,
  staffId,
}: {
  organizationId: string;
  staffId: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(getStaffTrainingEnrollments);
  const listQ = useQuery({
    queryKey: ["staff-training-enrollments", organizationId, staffId],
    queryFn: () => listFn({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const rows = listQ.data ?? [];

  if (listQ.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">No Hive Training enrollments for this staff member.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <EnrollmentRow
          key={r.id}
          row={r}
          organizationId={organizationId}
          staffId={staffId}
          onChanged={() =>
            qc.invalidateQueries({ queryKey: ["staff-training-enrollments", organizationId, staffId] })
          }
        />
      ))}
    </div>
  );
}

function EnrollmentRow({
  row,
  organizationId,
  staffId,
  onChanged,
}: {
  row: StaffEnrollmentRow;
  organizationId: string;
  staffId: string;
  onChanged: () => void;
}) {
  const [working, setWorking] = useState(false);
  const createUpload = useServerFn(createHrDocumentUploadUrl);
  const uploadCertFn = useServerFn(uploadTrainingCertificate);

  const handleFile = async (file: File) => {
    try {
      setWorking(true);
      const r = await createUpload({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          requirement_id: null,
          document_kind: `hive_training:${row.id}`,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      if (!r?.upload?.signed_url) throw new Error("Upload could not be prepared.");
      const up = await fetch(r.upload.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      const res = await uploadCertFn({
        data: { enrollment_id: row.id, hr_document_id: r.hr_document_id! },
      });
      if (res.validation_status === "failed") {
        toast.error(`Nectar could not verify this certificate:\n• ${res.reasons.join("\n• ") || "Unknown reason"}`, {
          duration: 10000,
        });
      } else {
        toast.success("Certificate uploaded and verified");
      }
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold">{row.product_name}</span>
        </div>
        <Badge variant="outline" className={STATUS_COLOR[row.status]}>{STATUS_LABEL[row.status]}</Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Enrolled {new Date(row.enrolled_at).toLocaleDateString()}
        {row.verified_at && ` · Verified ${new Date(row.verified_at).toLocaleDateString()}`}
        {row.nectar_extracted_expires_date && ` · Expires ${row.nectar_extracted_expires_date}`}
      </div>
      {row.status === "certificate_pending" && (
        <div className="mt-3">
          <label>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={working}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" disabled={working} asChild>
              <span className="inline-flex cursor-pointer items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" /> {working ? "Uploading…" : "Upload certificate"}
              </span>
            </Button>
          </label>
        </div>
      )}
    </div>
  );
}
