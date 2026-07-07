import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ClipboardList,
  ArrowRight,
  CheckCircle2,
  FileEdit,
  Circle,
  Loader2,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac-guard";
import { listIntakeFormsForClient, seedIntakeForms } from "@/lib/forms.functions";
import { ClientPhotoCard } from "@/components/clients/client-photo-card";
import { FaceSheetInfoCard } from "@/components/clients/face-sheet-info-card";

export const Route = createFileRoute("/dashboard/client-intake/$clientId")({
  head: () => ({ meta: [{ title: "New Client Intake — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <IntakeRunner />
    </RequirePermission>
  ),
});

// Canonical intake ordering by settings.subcategory; anything unrecognised
// sorts after, then by created_at (already applied server-side).
const SUBCAT_ORDER: Record<string, number> = {
  application: 0,
  independence: 1,
  consent: 2,
  pnp_attestation: 3,
  other: 4,
};

type IntakeForm = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  settings: Record<string, unknown> | null;
  all_clients: boolean;
  assigned_clients: string[] | null;
  updated_at: string;
  created_at: string;
};

type IntakeSub = {
  id: string;
  form_id: string;
  status: string; // 'draft' | 'submitted'
  submitted_at: string;
  submitted_by: string | null;
};

function IntakeRunner() {
  const { clientId } = Route.useParams();
  const fetchForms = useServerFn(listIntakeFormsForClient);
  const seed = useServerFn(seedIntakeForms);
  const qc = useQueryClient();
  const seededRef = useRef(false);

  const clientQ = useQuery({
    queryKey: ["client-intake-header", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("first_name, last_name, intake_status")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const intakeQ = useQuery({
    queryKey: ["intake-forms", clientId],
    queryFn: () => fetchForms({ data: { clientId } }),
    retry: false,
  });

  // One-time backfill per org: if the runner loads with zero intake forms,
  // seed the canonical five. The server function is itself idempotent — this
  // ref just avoids a second attempt within the same mount.
  useEffect(() => {
    if (seededRef.current) return;
    if (intakeQ.isLoading || intakeQ.error) return;
    const forms = (intakeQ.data?.forms as unknown[] | undefined) ?? [];
    if (forms.length > 0) return;
    seededRef.current = true;
    void seed()
      .then((res) => {
        if (res?.seeded && res.seeded > 0) {
          qc.invalidateQueries({ queryKey: ["intake-forms", clientId] });
          qc.invalidateQueries({ queryKey: ["forms-admin"] });
        }
      })
      .catch(() => {
        // Non-blocking: empty state still renders below if seeding fails.
      });
  }, [intakeQ.isLoading, intakeQ.error, intakeQ.data, seed, qc, clientId]);


  const client = clientQ.data;
  const name = client
    ? `${client.first_name} ${client.last_name}`.trim()
    : "this client";
  const intakeStatus = (client?.intake_status as string | null) ?? "in_progress";

  const formsRaw: IntakeForm[] = (intakeQ.data?.forms as IntakeForm[] | undefined) ?? [];
  const submissions: IntakeSub[] = (intakeQ.data?.submissions as IntakeSub[] | undefined) ?? [];

  const forms = [...formsRaw].sort((a, b) => {
    const sa = (a.settings?.subcategory as string | undefined) ?? "";
    const sb = (b.settings?.subcategory as string | undefined) ?? "";
    const ra = SUBCAT_ORDER[sa] ?? 99;
    const rb = SUBCAT_ORDER[sb] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });

  // Per-form status: pick the most recent submission for this (form, client).
  // 'submitted' wins, else 'draft', else 'not_started'.
  function statusFor(formId: string): "not_started" | "draft" | "submitted" {
    const subs = submissions.filter((s) => s.form_id === formId);
    if (subs.some((s) => s.status === "submitted")) return "submitted";
    if (subs.some((s) => s.status === "draft")) return "draft";
    return "not_started";
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-0 space-y-4">
      <Link
        to="/dashboard/hub/clients"
        search={{ tab: "directory" }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Clients
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            <span>New client intake — {name}</span>
            <Badge variant="outline" className="ml-1 font-mono text-[10px]">
              {intakeStatus}
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Complete each intake form in order. Submissions are tied to this client's
            record and contribute to the intake checklist.
          </p>
        </CardHeader>
        <CardContent>
          {intakeQ.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading intake forms…
            </div>
          ) : intakeQ.error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50/30 p-4 text-sm text-rose-700">
              {(intakeQ.error as Error).message}
            </p>
          ) : forms.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No intake forms configured yet. Intake templates are seeded in
              the next build — once published with category{" "}
              <span className="font-mono">intake</span>, they'll appear here in
              order.
            </div>
          ) : (
            <ul className="space-y-2">
              {forms.map((f) => (
                <IntakeFormRow
                  key={f.id}
                  form={f}
                  clientId={clientId}
                  status={statusFor(f.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ClientPhotoCard clientId={clientId} />
      <FaceSheetInfoCard clientId={clientId} />
    </div>
  );
}


function IntakeFormRow({
  form,
  clientId,
  status,
}: {
  form: IntakeForm;
  clientId: string;
  status: "not_started" | "draft" | "submitted";
}) {
  const Icon =
    status === "submitted"
      ? CheckCircle2
      : status === "draft"
        ? FileEdit
        : Circle;
  const iconColor =
    status === "submitted"
      ? "text-emerald-600"
      : status === "draft"
        ? "text-amber-600"
        : "text-muted-foreground";
  const label =
    status === "submitted"
      ? "Submitted"
      : status === "draft"
        ? "Draft"
        : "Not started";
  const subcat = (form.settings?.subcategory as string | undefined) ?? null;
  const purpose = (form.settings?.purpose as string | undefined) ?? null;
  const requiredForIntake = form.settings?.required_for_intake === true;

  return (
    <li className="rounded-lg border border-border/60 p-3 text-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex items-start gap-2">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
          <div className="min-w-0">
            <div className="font-medium">{form.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              {subcat && (
                <Badge variant="secondary" className="text-[10px]">
                  {subcat}
                </Badge>
              )}
              {requiredForIntake && (
                <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700">
                  Company-required
                </Badge>
              )}
              <span>{label}</span>
              {form.description && (
                <span className="truncate">· {form.description}</span>
              )}
            </div>
            {purpose && (
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                Purpose: {purpose}
              </p>
            )}
          </div>
        </div>
        <div className="flex md:justify-end">
          <Button
            asChild
            size="sm"
            variant={status === "submitted" ? "outline" : "default"}
            className="min-h-[44px] gap-1"
          >
            <Link
              to="/dashboard/forms/$formId/fill"
              params={{ formId: form.id }}
              search={{ clientId }}
            >
              {status === "submitted"
                ? "Re-open"
                : status === "draft"
                  ? "Resume"
                  : "Open"}{" "}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}
