import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientTrackingForms } from "@/lib/forms.functions";
import type { FormField, FormSettings } from "@/lib/forms-utils";
import { ChevronRight, FileText, Link2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

type TrackingForm = {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[] | null;
  settings: FormSettings | null;
  all_clients: boolean;
  assigned_clients: string[] | null;
  updated_at: string;
};

type Submission = {
  id: string;
  form_id: string;
  submitted_at: string;
  submitted_by: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  answers: Record<string, any>;
  shift_id: string | null;
};

function formatAnswer(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.map(formatAnswer).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function codeLabel(s: FormSettings | null): string {
  const mode = s?.tracking_code_mode ?? "all";
  if (mode === "all") return "All codes";
  const codes = s?.tracking_billing_codes ?? [];
  if (!codes.length) return "No codes selected";
  return `Codes: ${codes.join(", ")}`;
}

function enforcementLabel(s: FormSettings | null): string | null {
  switch (s?.tracking_enforcement) {
    case "reminded": return "Reminded";
    case "required_before_clockout": return "Required before clock-out";
    case "required_before_next_clockin": return "Required before next clock-in";
    case "optional":
    default: return null;
  }
}

function FormRow({
  form,
  submissions,
  submitterNames,
}: {
  form: TrackingForm;
  submissions: Submission[];
  submitterNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const enf = enforcementLabel(form.settings);
  const fieldByKey = useMemo(() => {
    const m = new Map<string, FormField>();
    for (const f of form.fields ?? []) m.set(f.id, f);
    return m;
  }, [form.fields]);

  return (
    <div className="rounded-lg border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
      >
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#137182]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">{form.name}</p>
            <Badge variant="outline" className="text-[10px]">{codeLabel(form.settings)}</Badge>
            {enf && <Badge variant="outline" className="text-[10px]">{enf}</Badge>}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {submissions.length} {submissions.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          {form.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{form.description}</p>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-border/60 px-3 py-3">
          {submissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {submissions.map((s) => {
                const who = s.submitted_by ? submitterNames[s.submitted_by] ?? "Unknown" : "Unknown";
                const when = new Date(s.submitted_at).toLocaleString();
                const entries = Object.entries(s.answers ?? {});
                return (
                  <li key={s.id} className="rounded-md border border-border/50 bg-surface-warm/40 p-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{when}</span>
                      <span>·</span>
                      <span>{who}</span>
                      {s.shift_id && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Link2 className="h-3 w-3" /> on shift
                        </Badge>
                      )}
                    </div>
                    {entries.length > 0 && (
                      <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        {entries.map(([k, v]) => {
                          const label = fieldByKey.get(k)?.label ?? k;
                          return (
                            <div key={k} className="flex gap-1.5">
                              <dt className="text-muted-foreground shrink-0">{label}:</dt>
                              <dd className="text-foreground break-words">{formatAnswer(v)}</dd>
                            </div>
                          );
                        })}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function PerShiftFormsCareSection({ clientId }: { clientId: string; orgId?: string }) {
  const fetchFn = useServerFn(listClientTrackingForms);
  const { data, isLoading } = useQuery({
    queryKey: ["per-shift-tracking-forms", clientId],
    queryFn: () => fetchFn({ data: { clientId } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const forms = (data?.forms ?? []) as TrackingForm[];
  const subs = (data?.submissions ?? []) as Submission[];
  const submitterNames = (data?.submitterNames ?? {}) as Record<string, string>;

  if (forms.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No tracking forms for this client"
        description="When an admin creates a per-shift tracking form targeted at this client, it will appear here."
      />
    );
  }

  const byForm = new Map<string, Submission[]>();
  for (const s of subs) {
    const list = byForm.get(s.form_id) ?? [];
    list.push(s);
    byForm.set(s.form_id, list);
  }

  return (
    <div className="space-y-2">
      {forms.map((f) => (
        <FormRow
          key={f.id}
          form={f}
          submissions={byForm.get(f.id) ?? []}
          submitterNames={submitterNames}
        />
      ))}
    </div>
  );
}

/** Count of applicable tracking forms (for the section summary). */
export function usePerShiftFormsCount(clientId: string): number | null {
  const fetchFn = useServerFn(listClientTrackingForms);
  const { data } = useQuery({
    queryKey: ["per-shift-tracking-forms", clientId],
    queryFn: () => fetchFn({ data: { clientId } }),
  });
  if (!data) return null;
  return (data.forms ?? []).length;
}
