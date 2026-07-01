// PCSP tab — surfaces the client's Person-Centered Support Plan as an
// authoritative, human-readable document reproduced from what NECTAR already
// extracted into the client profile.
//
// This is READ-ONLY presentation. The canonical stores stay put:
//   • clients row (demographics, plan dates, rights, health flags, SC)
//   • client_documents (source PCSP PDF)
//   • client_emergency_contacts
//   • client_medications
//   • client_billing_codes (the "1056" — authorized services & units)
//   • client_progress_summaries (goal progress / attention)
//
// Financial section (unit rates + authorized totals) is gated behind a
// permission so most staff never see dollar figures.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Lock,
  Sparkles,
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import type { CSTGoal } from "@/lib/client-specific-training.functions";

type ClientRow = Record<string, unknown> | null | undefined;

function fmtDate(d: unknown): string {
  if (!d) return "—";
  try {
    const dt = new Date(String(d));
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(d);
  }
}

function daysUntil(d: unknown): number | null {
  if (!d) return null;
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  return Math.round((dt.getTime() - Date.now()) / 86_400_000);
}

function Field({ label, value }: { label: string; value: unknown }) {
  const v =
    value === null || value === undefined || value === "" ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      String(value)
    );
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{v}</dd>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  right,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="mt-0.5 rounded p-1 hover:bg-muted"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
          </div>
        </div>
        {right}
      </CardHeader>
      {open && <CardContent className="text-sm">{children}</CardContent>}
    </Card>
  );
}

export function PcspTab({
  client,
  clientId,
  orgId,
}: {
  client: ClientRow;
  clientId: string;
  orgId?: string;
}) {
  const { can } = usePermissions();
  const canSeeFinancial =
    can("view_financial_tns_gross") || can("manage_billing") || can("view_billing");

  // Source PCSP document (most recent).
  const pcspDocQ = useQuery({
    enabled: !!clientId,
    queryKey: ["pcsp-source-doc", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents")
        .select("id, file_name, storage_path, file_url, uploaded_at, document_type")
        .eq("client_id", clientId)
        .eq("document_type", "pcsp")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const emergencyQ = useQuery({
    enabled: !!clientId,
    queryKey: ["pcsp-emergency-contacts", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_emergency_contacts")
        .select("id, name, phone, relationship, instructions")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const medsQ = useQuery({
    enabled: !!clientId,
    queryKey: ["pcsp-medications", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_medications")
        .select(
          "id, medication_name, dosage, route, frequency, scheduled_time, prescriber, instructions, support_level, is_prn, prn_instructions, purpose, adverse_effects, choking_risk, is_controlled",
        )
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("medication_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const codesQ = useQuery({
    enabled: !!clientId,
    queryKey: ["pcsp-billing-codes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select(
          "id, service_code, units_authorized, unit_type, rate_per_unit, effective_start, effective_end, authorization_pending",
        )
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const summariesQ = useQuery({
    enabled: !!clientId,
    queryKey: ["pcsp-progress-summaries", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_progress_summaries")
        .select("id, period_start, period_end, status, published_at, updated_at")
        .eq("client_id", clientId)
        .order("period_end", { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });

  const [pcspUrl, setPcspUrl] = useState<string | null>(null);
  const doc = pcspDocQ.data;
  const openPcspPdf = async () => {
    if (!doc) return;
    const path = (doc.storage_path as string) || (doc.file_url as string);
    if (!path) return;
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank");
      return;
    }
    const { data, error } = await supabase.storage
      .from("client-documents")
      .createSignedUrl(path, 600);
    if (error || !data?.signedUrl) return;
    setPcspUrl(data.signedUrl);
    window.open(data.signedUrl, "_blank");
  };

  const goals: CSTGoal[] = Array.isArray(client?.pcsp_goals)
    ? (client!.pcsp_goals as CSTGoal[])
    : [];
  const rights: string[] = Array.isArray(client?.rights_restrictions)
    ? (client!.rights_restrictions as string[])
    : [];
  const diagnoses: string[] = Array.isArray(client?.diagnoses)
    ? (client!.diagnoses as string[])
    : [];
  const advDirectives: string[] = Array.isArray(client?.advanced_directives)
    ? (client!.advanced_directives as string[])
    : [];
  const codes: string[] = Array.isArray(client?.authorized_dspd_codes)
    ? (client!.authorized_dspd_codes as string[])
    : [];

  const expiresIn = daysUntil((client as Record<string, unknown> | null)?.pcsp_expiration_date);

  const goalsIncomplete = useMemo(() => {
    return goals.filter(
      (g) => !((g.supports ?? "").trim() && (g.details ?? "").trim()),
    ).length;
  }, [goals]);

  const latestSummary = summariesQ.data?.[0];
  const latestSummaryFresh = useMemo(() => {
    const last = latestSummary?.published_at || latestSummary?.updated_at;
    if (!last) return false;
    const d = daysUntil(last);
    return d !== null && d >= -120; // within 4 months
  }, [latestSummary]);

  if (!client) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading PCSP…</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 mt-0.5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Person-Centered Support Plan</p>
              <p className="text-xs text-muted-foreground">
                Authoritative source for supports, goals, and services. NECTAR draws from this
                document and other uploaded plans to guide staff — it never replaces or rewrites
                what the plan says.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {(client as Record<string, unknown>).pcsp_expiration_date ? (
                  <Badge
                    variant={expiresIn !== null && expiresIn < 30 ? "destructive" : "outline"}
                    className="gap-1"
                  >
                    Expires {fmtDate((client as Record<string, unknown>).pcsp_expiration_date)}
                    {expiresIn !== null ? ` · ${expiresIn}d` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline">No expiration on file</Badge>
                )}
                {doc ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Source PDF uploaded {fmtDate(doc.uploaded_at)}
                  </Badge>
                ) : (
                  <Badge variant="destructive">No PCSP uploaded</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {doc ? (
              <Button size="sm" variant="outline" onClick={openPcspPdf}>
                Open source PDF
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Person overview */}
      <Section title="Person & plan overview">
        <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Field label="Legal name" value={`${client.first_name ?? ""} ${client.last_name ?? ""}`.trim()} />
          <Field label="Date of birth" value={fmtDate(client.date_of_birth)} />
          <Field label="Medicaid #" value={client.medicaid_id} />
          <Field label="Disability category" value={client.disability_category} />
          <Field label="Level of need" value={client.level_of_need} />
          <Field label="Physical address" value={client.physical_address} />
          <Field label="Phone" value={client.phone_number} />
          <Field label="Admission date" value={fmtDate(client.admission_date)} />
          <Field label="Form 1056 #" value={client.form_1056_number} />
          <Field label="1056 approved" value={fmtDate(client.form_1056_approved_date)} />
        </dl>
      </Section>

      {/* Support coordinator & team */}
      <Section title="Support coordinator & care team">
        <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Field label="Support coordinator" value={client.support_coordinator_name} />
          <Field label="SC phone" value={client.support_coordinator_phone} />
          <Field label="SC email" value={client.support_coordinator_email} />
          <Field label="SC company" value={(client as Record<string, unknown>).support_coordinator_company} />
          <Field label="Primary care physician" value={(client as Record<string, unknown>).primary_care_physician_name} />
          <Field label="PCP phone" value={(client as Record<string, unknown>).primary_care_physician_phone} />
          <Field label="Specialist" value={(client as Record<string, unknown>).specialist_name} />
          <Field label="Specialist phone" value={(client as Record<string, unknown>).specialist_phone} />
        </dl>
      </Section>

      {/* Emergency contacts */}
      <Section title="Emergency contacts" subtitle={emergencyQ.data?.length ? undefined : "None recorded"}>
        {emergencyQ.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (emergencyQ.data ?? []).length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {client.emergency_contact_name || client.emergency_contact_phone ? (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">{String(client.emergency_contact_name ?? "—")}</p>
                <p className="text-xs text-muted-foreground">{String(client.emergency_contact_phone ?? "")}</p>
                {client.emergency_contact_instructions ? (
                  <p className="mt-1 text-xs">{String(client.emergency_contact_instructions)}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground">No emergency contacts on file.</p>
            )}
            {client.emergency_contact_2_name || client.emergency_contact_2_phone ? (
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">{String(client.emergency_contact_2_name ?? "—")}</p>
                <p className="text-xs text-muted-foreground">{String(client.emergency_contact_2_phone ?? "")}</p>
                {client.emergency_contact_2_instructions ? (
                  <p className="mt-1 text-xs">{String(client.emergency_contact_2_instructions)}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {emergencyQ.data!.map((c) => (
              <div key={c.id as string} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{String(c.name ?? "—")}</p>
                  {c.relationship ? (
                    <Badge variant="outline" className="text-[10px]">{String(c.relationship)}</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{String(c.phone ?? "")}</p>
                {c.instructions ? <p className="mt-1 text-xs">{String(c.instructions)}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Authorized services */}
      <Section
        title="Authorized services (1056)"
        subtitle="Only these codes may be scheduled and billed for this person."
      >
        {codes.length === 0 && (codesQ.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">No authorized codes on file.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {codes.map((c) => (
                <Badge key={c} variant="secondary">{c}</Badge>
              ))}
            </div>
            {(codesQ.data ?? []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5 pr-3">Code</th>
                      <th className="py-1.5 pr-3">Units</th>
                      <th className="py-1.5 pr-3">Unit type</th>
                      <th className="py-1.5 pr-3">Effective</th>
                      {canSeeFinancial ? <th className="py-1.5 pr-3">Rate / unit</th> : null}
                      {canSeeFinancial ? <th className="py-1.5 pr-3">Authorized $</th> : null}
                      <th className="py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codesQ.data!.map((row) => {
                      const units = Number(row.units_authorized ?? 0);
                      const rate = Number(row.rate_per_unit ?? 0);
                      return (
                        <tr key={row.id as string} className="border-b last:border-none">
                          <td className="py-1.5 pr-3 font-mono">{String(row.service_code ?? "")}</td>
                          <td className="py-1.5 pr-3">{units || "—"}</td>
                          <td className="py-1.5 pr-3">{String(row.unit_type ?? "—")}</td>
                          <td className="py-1.5 pr-3">
                            {fmtDate(row.effective_start)}
                            {row.effective_end ? ` – ${fmtDate(row.effective_end)}` : ""}
                          </td>
                          {canSeeFinancial ? (
                            <td className="py-1.5 pr-3">{rate ? `$${rate.toFixed(2)}` : "—"}</td>
                          ) : null}
                          {canSeeFinancial ? (
                            <td className="py-1.5 pr-3">
                              {units && rate ? `$${(units * rate).toFixed(2)}` : "—"}
                            </td>
                          ) : null}
                          <td className="py-1.5">
                            {row.authorization_pending ? (
                              <Badge variant="outline" className="text-[10px]">Pending</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Active</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!canSeeFinancial && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" /> Rate and dollar totals hidden — you don't have financial access.
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Goals & progress */}
      <Section
        title="Goals & progress"
        subtitle={goals.length ? `${goals.length} goal${goals.length === 1 ? "" : "s"} from PCSP` : "No goals extracted yet"}
        right={
          goalsIncomplete > 0 ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              <AlertTriangle className="mr-1 h-3 w-3" /> {goalsIncomplete} need attention
            </Badge>
          ) : null
        }
      >
        {goals.length === 0 ? (
          <p className="text-muted-foreground">
            Goals appear here once the PCSP is uploaded and NECTAR extracts them. Add them
            manually from the Care tab if the PCSP doesn't list any.
          </p>
        ) : (
          <>
            {!latestSummaryFresh && (
              <Alert className="mb-3 border-amber-300 bg-amber-50 text-amber-900">
                <Sparkles className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {latestSummary
                    ? `Most recent progress summary ended ${fmtDate(latestSummary.period_end)} — a fresh summary may be due.`
                    : "No progress summaries recorded yet for these goals."}
                </AlertDescription>
              </Alert>
            )}
            <ol className="space-y-2">
              {goals.map((g, i) => {
                const incomplete = !((g.supports ?? "").trim() && (g.details ?? "").trim());
                return (
                  <li
                    key={g.id ?? i}
                    className={`rounded-md border p-3 ${incomplete ? "border-amber-300 bg-amber-50/40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        <span className="text-muted-foreground mr-1">{i + 1}.</span>
                        {g.goal}
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        {(g.job_codes ?? []).map((c, j) => (
                          <Badge key={`${c}-${j}`} variant="outline" className="text-[10px]">
                            {c}
                          </Badge>
                        ))}
                        {incomplete ? (
                          <Badge variant="outline" className="border-amber-400 text-amber-800 text-[10px]">
                            Needs supports/details
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-foreground">Supports</dt>
                        <dd className="text-muted-foreground">{g.supports?.trim() || "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-foreground">Objective / measure</dt>
                        <dd className="text-muted-foreground">{g.details?.trim() || "—"}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Section>

      {/* Rights, restrictions, and special directions */}
      <Section title="Rights, restrictions & special directions">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Rights restrictions
            </p>
            {rights.length === 0 ? (
              <p className="text-sm text-muted-foreground">None documented.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {rights.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Special directions
            </p>
            <p className="text-sm whitespace-pre-wrap">
              {client.special_directions ? String(client.special_directions) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
        </div>
      </Section>

      {/* Health & medical */}
      <Section title="Health & end-of-life">
        <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Field label="DNR status" value={client.dnr_status} />
          <Field label="DNR location" value={client.dnr_location} />
          <Field label="POLST" value={client.polst_status} />
          <Field label="Palliative care" value={client.palliative_care_status} />
          <Field label="Hospice" value={client.hospice_status} />
          <Field label="BSP status" value={client.bsp_status} />
        </dl>
        {diagnoses.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Diagnoses
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {diagnoses.map((d, i) => (
                <Badge key={`${d}-${i}`} variant="outline">{d}</Badge>
              ))}
            </div>
          </div>
        )}
        {advDirectives.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Advanced directives
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {advDirectives.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Medications */}
      <Section
        title="Medications (MAR-ready)"
        subtitle={
          medsQ.data?.length
            ? `${medsQ.data.length} active medication${medsQ.data.length === 1 ? "" : "s"}`
            : "No active medications"
        }
      >
        {medsQ.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (medsQ.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">
            No medications on file. If the PCSP lists medications, re-extract from the source PDF
            or add them from the Medications management screen.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-3">Medication</th>
                  <th className="py-1.5 pr-3">Dose</th>
                  <th className="py-1.5 pr-3">Route</th>
                  <th className="py-1.5 pr-3">Schedule</th>
                  <th className="py-1.5 pr-3">Support</th>
                  <th className="py-1.5">Flags</th>
                </tr>
              </thead>
              <tbody>
                {medsQ.data!.map((m) => (
                  <tr key={m.id as string} className="border-b align-top last:border-none">
                    <td className="py-1.5 pr-3">
                      <p className="font-medium">{String(m.medication_name ?? "—")}</p>
                      {m.purpose ? (
                        <p className="text-[10px] text-muted-foreground">{String(m.purpose)}</p>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">{String(m.dosage ?? "—")}</td>
                    <td className="py-1.5 pr-3">{String(m.route ?? "—")}</td>
                    <td className="py-1.5 pr-3">
                      {m.is_prn ? "PRN" : String(m.frequency ?? m.scheduled_time ?? "—")}
                      {m.is_prn && m.prn_instructions ? (
                        <p className="text-[10px] text-muted-foreground">{String(m.prn_instructions)}</p>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">{String(m.support_level ?? "—")}</td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {m.is_controlled ? (
                          <Badge variant="destructive" className="text-[10px]">Controlled</Badge>
                        ) : null}
                        {m.choking_risk ? (
                          <Badge variant="outline" className="border-amber-400 text-amber-800 text-[10px]">
                            Choking risk
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Financial gate (already inlined into services) */}
      {!canSeeFinancial && (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Lock className="h-4 w-4" />
            Financial details from the PCSP (unit rates, monthly cost caps, PBA balances) are
            hidden from your role. Ask an admin if you need access.
          </CardContent>
        </Card>
      )}

      {/* NECTAR footer */}
      <Card className="border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground">
          <p>
            NECTAR uses this PCSP — together with any uploaded behavior support plans and
            medication documents — as the governing source of truth when drafting client-specific
            training, support strategies, and staff guidance. It never publishes or edits plan
            content on its own; admins review and attest first.
          </p>
        </CardContent>
      </Card>

      {/* Hidden ref to suppress unused var lint if no doc */}
      {pcspUrl ? null : null}
      {orgId ? null : null}
    </div>
  );
}
