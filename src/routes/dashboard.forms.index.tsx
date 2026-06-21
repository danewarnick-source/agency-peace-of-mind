import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, FileText, Sparkles, Archive, Send, Edit3, Trash2, ChevronRight } from "lucide-react";
import { useEffectiveView } from "@/hooks/use-effective-view";
import { useCaseload } from "@/hooks/use-caseload";
import {
  listForms, listMyForms, archiveForm, saveForm,
  getMyFormNotifications, markFormNotificationsRead, seedIntakeForms,
} from "@/lib/forms.functions";
import {
  periodKeyFor, dueDateFor, formatDue, describeFrequency, isOverdue,
  type Frequency, type Schedule, type FormSettings,
} from "@/lib/forms-utils";
import { DeleteFormDialog } from "@/components/forms/delete-form-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/forms/")({
  head: () => ({ meta: [{ title: "Forms — HIVE" }] }),
  component: FormsIndex,
});

type AdminFormRow = {
  id: string; name: string; status: string; frequency: Frequency; schedule: Schedule;
  fields: unknown[]; assigned_groups: string[]; assigned_users: string[];
};

export function FormsIndex() {
  const { effective } = useEffectiveView();
  return effective === "admin" ? <AdminList /> : <StaffList />;
}

// ─── ADMIN ─────────────────────────────────────────────────────────────────
function AdminList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchList = useServerFn(listForms);
  const save = useServerFn(saveForm);
  const archive = useServerFn(archiveForm);
  const seed = useServerFn(seedIntakeForms);
  const { data, isLoading } = useQuery({ queryKey: ["forms-admin"], queryFn: () => fetchList() });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function createBlank() {
    const out = await save({ data: {
      name: "Untitled form", category: "general", fields: [], frequency: "as_needed",
      schedule: {}, assigned_groups: [], assigned_users: [], settings: {},
    } });
    qc.invalidateQueries({ queryKey: ["forms-admin"] });
    if (out.form?.id) navigate({ to: "/dashboard/forms/$formId/edit", params: { formId: out.form.id } });
  }

  async function restoreIntakeDefaults() {
    setRestoring(true);
    try {
      const res = await seed();
      if (res?.seeded && res.seeded > 0) {
        toast.success(`Restored ${res.seeded} default intake forms.`);
        qc.invalidateQueries({ queryKey: ["forms-admin"] });
      } else {
        toast.message("Intake forms already exist — nothing to restore.");
      }
    } catch (e) {
      toast.error((e as Error).message || "Could not restore intake forms.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
          <p className="text-sm text-muted-foreground">Build custom intake forms for your staff. Submissions land in Records → Forms.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={restoreIntakeDefaults} disabled={restoring}>
            {restoring ? "Restoring…" : "Restore default intake forms"}
          </Button>
          <Button onClick={createBlank}><Plus className="mr-1.5 h-4 w-4" /> New form</Button>
        </div>
      </div>


      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {((data?.forms ?? []) as AdminFormRow[]).map((f) => (
            <Card key={f.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{f.name}</CardTitle>
                  <Badge variant={f.status === "published" ? "default" : f.status === "draft" ? "secondary" : "outline"}>{f.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 text-xs text-muted-foreground">
                <p>{(f.fields ?? []).length} fields · {describeFrequency(f.frequency, f.schedule ?? {})}</p>
                <p>{f.assigned_groups?.length || 0} groups · {f.assigned_users?.length || 0} individuals</p>
                <div className="pt-2 flex flex-wrap gap-1.5">
                  <Link to="/dashboard/forms/$formId/edit" params={{ formId: f.id }}>
                    <Button size="sm" variant="outline" className="min-h-[36px]"><Edit3 className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                  </Link>
                  <Link to="/dashboard/forms/$formId/submissions" params={{ formId: f.id }}>
                    <Button size="sm" variant="outline" className="min-h-[36px]"><FileText className="mr-1 h-3.5 w-3.5" /> Submissions</Button>
                  </Link>
                  {f.status !== "archived" && (
                    <Button size="sm" variant="ghost" className="min-h-[36px] text-rose-600"
                      onClick={async () => { await archive({ data: { formId: f.id } }); toast.success("Archived"); qc.invalidateQueries({ queryKey: ["forms-admin"] }); }}>
                      <Archive className="mr-1 h-3.5 w-3.5" /> Archive
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="min-h-[36px] text-rose-700 hover:text-rose-800 hover:bg-rose-50"
                    onClick={() => setDeleteTarget({ id: f.id, name: f.name })}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(data?.forms ?? []).length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-amber-500" />
              No forms yet. Click <strong>New form</strong> to build one — or use <strong>Build with Nectar</strong> inside the editor.
            </div>
          )}
        </div>
      )}
      {deleteTarget && (
        <DeleteFormDialog
          open={!!deleteTarget}
          onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
          formId={deleteTarget.id}
          formName={deleteTarget.name}
          onDeleted={() => { setDeleteTarget(null); qc.invalidateQueries({ queryKey: ["forms-admin"] }); }}
        />
      )}
    </div>
  );
}

// ─── STAFF ─────────────────────────────────────────────────────────────────
type FormRow = {
  id: string; name: string; frequency: Frequency; schedule: Schedule;
  settings: FormSettings; fields: unknown[]; description?: string | null;
};

function StaffList() {
  const navigate = useNavigate();
  const fetchMine = useServerFn(listMyForms);
  const fetchBell = useServerFn(getMyFormNotifications);
  const markRead = useServerFn(markFormNotificationsRead);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-forms"], queryFn: () => fetchMine() });
  const { data: bell } = useQuery({ queryKey: ["my-form-notifs"], queryFn: () => fetchBell() });

  // A staff form is submitted in the context of a client, and the fill screen
  // requires a clientId. Forms here are assigned to the staff (not a client), so
  // "Complete form" opens a picker of the staff member's caseload; choosing a
  // client navigates to the fill screen WITH the required clientId.
  const { data: caseload = [], isLoading: caseloadLoading } = useCaseload();
  const [pickFor, setPickFor] = useState<FormRow | null>(null);
  function chooseClient(clientId: string) {
    const f = pickFor;
    setPickFor(null);
    if (f) navigate({ to: "/dashboard/forms/$formId/fill", params: { formId: f.id }, search: { clientId } });
  }

  const [popup, setPopup] = useState<{ id: string; title: string; body: string } | null>(null);
  useEffect(() => {
    const unread = (bell?.notifications ?? []).find((n: { read_at: string | null; type: string }) => !n.read_at && n.type === "form_assigned");
    if (unread) setPopup({ id: unread.id, title: unread.title, body: unread.body });
  }, [bell]);

  const forms = (data?.forms ?? []) as FormRow[];
  const subs = data?.submissions ?? [];

  const buckets = useMemo(() => {
    const due: FormRow[] = [];
    const anytime: FormRow[] = [];
    const submitted: { form: FormRow; submittedAt: string }[] = [];
    const now = new Date();
    for (const f of forms) {
      const periodKey = periodKeyFor(f.frequency);
      const mySub = subs.find((s) => s.form_id === f.id && s.period_key === periodKey);
      if (mySub) submitted.push({ form: f, submittedAt: mySub.submitted_at });
      else if (f.frequency === "as_needed") anytime.push(f);
      else due.push(f);
    }
    return { due, anytime, submitted, now };
  }, [forms, subs]);

  async function dismissPopup() {
    if (popup) await markRead({ data: { ids: [popup.id] } });
    setPopup(null);
    qc.invalidateQueries({ queryKey: ["my-form-notifs"] });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
        <p className="text-sm text-muted-foreground">Forms your agency has assigned to you.</p>
      </div>

      <Section title="Needs attention" subtitle="Submit before the due date for the current period.">
        <div className="grid gap-2 md:grid-cols-2">
          {buckets.due.map((f) => {
            const due = dueDateFor(f.frequency, f.schedule);
            const overdue = isOverdue(due);
            return (
              <button key={f.id} type="button" onClick={() => setPickFor(f)}
                className="block w-full text-left rounded-lg border border-border bg-card p-4 hover:bg-muted/40 min-h-[44px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{describeFrequency(f.frequency, f.schedule)}</p>
                  </div>
                  <Badge variant={overdue ? "destructive" : "secondary"}>{overdue ? "Overdue" : "Due"} {formatDue(due)}</Badge>
                </div>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground min-h-[40px]">
                  <Send className="h-3.5 w-3.5" /> Complete form
                </span>
              </button>
            );
          })}
          {buckets.due.length === 0 && <Empty>All caught up.</Empty>}
        </div>
      </Section>

      <Section title="Start anytime" subtitle="Forms you can submit whenever you like.">
        <div className="grid gap-2 md:grid-cols-2">
          {buckets.anytime.map((f) => (
            <button key={f.id} type="button" onClick={() => setPickFor(f)}
              className="block w-full text-left rounded-lg border border-border bg-card p-4 hover:bg-muted/40 min-h-[44px]">
              <p className="font-semibold truncate">{f.name}</p>
              <p className="text-xs text-muted-foreground">As needed</p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground min-h-[40px]">
                <Send className="h-3.5 w-3.5" /> Complete form
              </span>
            </button>
          ))}
          {buckets.anytime.length === 0 && <Empty>No anytime forms assigned.</Empty>}
        </div>
      </Section>

      <Section title="Submitted (this period)">
        <div className="space-y-1.5">
          {buckets.submitted.map(({ form, submittedAt }) => (
            <div key={form.id} className="flex flex-col md:flex-row md:items-center justify-between rounded-md border border-border bg-card px-3 py-2 gap-1">
              <p className="text-sm font-medium truncate">{form.name}</p>
              <p className="text-xs text-muted-foreground">Submitted {new Date(submittedAt).toLocaleString()}</p>
            </div>
          ))}
          {buckets.submitted.length === 0 && <Empty>No submissions yet this period.</Empty>}
        </div>
      </Section>

      <Dialog open={!!pickFor} onOpenChange={(o) => !o && setPickFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Which client is this form for?</DialogTitle></DialogHeader>
          {pickFor && <p className="text-sm text-muted-foreground">{pickFor.name}</p>}
          {caseloadLoading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading your clients…</p>
          ) : caseload.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              You don't have any assigned clients yet. Ask your administrator to assign you to a
              client before completing this form.
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto py-1">
              {caseload.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => chooseClient(c.id)}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm hover:bg-muted"
                >
                  <span className="font-medium">{c.last_name}, {c.first_name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!popup} onOpenChange={(o) => !o && dismissPopup()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{popup?.title}</DialogTitle></DialogHeader>
          <p className="text-sm whitespace-pre-line">{popup?.body}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={dismissPopup}>Got it</Button>
            <Button onClick={dismissPopup}>View Forms</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{children}</p>;
}
