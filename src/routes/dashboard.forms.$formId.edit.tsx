import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  Save, Sparkles, Plus, ChevronLeft, Settings as SettingsIcon, Users, FolderTree, CalendarClock, Send, Check, CircleDot, Trash2,
} from "lucide-react";
import { getForm, saveForm, nectarProposeRouting } from "@/lib/forms.functions";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { DeleteFormDialog } from "@/components/forms/delete-form-dialog";
import {
  type FormField, type FieldType, type Frequency, type Schedule, type FormSettings, type RoutingBehavior,
  defaultFieldFor, FORM_CATEGORIES, ROUTING_BEHAVIORS, describeFrequency, sanitizeConditions, isFieldVisible,
} from "@/lib/forms-utils";
import { FieldEditor, TYPE_GROUPS, TYPE_LABEL } from "@/components/forms/field-editor";
import { SortableFields } from "@/components/forms/sortable-fields";
import { FieldRenderer } from "@/components/forms/field-renderer";
import { NectarDraftModal } from "@/components/forms/nectar-draft-modal";
import { SettingsModal } from "@/components/forms/settings-modal";
import { AssignModal } from "@/components/forms/assign-modal";
import { PublishModal } from "@/components/forms/publish-modal";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/forms/$formId/edit")({
  head: () => ({ meta: [{ title: "Edit form — HIVE" }] }),
  component: EditForm,
});

function EditForm() {
  const { formId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchForm = useServerFn(getForm);
  const save = useServerFn(saveForm);

  const { data, isLoading } = useQuery({ queryKey: ["form-edit", formId], queryFn: () => fetchForm({ data: { formId } }) });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [fields, setFields] = useState<FormField[]>([]);
  const [frequency, setFrequency] = useState<Frequency>("as_needed");
  const [schedule, setSchedule] = useState<Schedule>({});
  const [groups, setGroups] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [allClients, setAllClients] = useState<boolean>(true);
  const [clients, setClients] = useState<string[]>([]);
  const [settings, setSettings] = useState<FormSettings>({});
  const [isNectarDraft, setIsNectarDraft] = useState(false);

  const [showNectar, setShowNectar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [baseline, setBaseline] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const f = data?.form;
    if (!f) return;
    const flds = Array.isArray(f.fields) ? f.fields : [];
    setName(f.name ?? ""); setDescription(f.description ?? "");
    setCategory(f.category ?? "general");
    setFields(flds);
    setFrequency(f.frequency ?? "as_needed");
    setSchedule(f.schedule ?? {});
    setGroups(f.assigned_groups ?? []);
    setUsers(f.assigned_users ?? []);
    setAllClients(f.all_clients ?? true);
    setClients(f.assigned_clients ?? []);
    setSettings(f.settings ?? {});
    setBaseline(JSON.stringify({
      name: f.name ?? "", description: f.description ?? "", category: f.category ?? "general",
      fields: flds, frequency: f.frequency ?? "as_needed", schedule: f.schedule ?? {},
      groups: f.assigned_groups ?? [], users: f.assigned_users ?? [],
      allClients: f.all_clients ?? true, clients: f.assigned_clients ?? [],
      settings: f.settings ?? {},
    }));
  }, [data]);

  const currentSnapshot = useMemo(() => JSON.stringify({
    name, description, category, fields, frequency, schedule,
    groups, users, allClients, clients, settings,
  }), [name, description, category, fields, frequency, schedule, groups, users, allClients, clients, settings]);
  const isDirty = baseline !== "" && currentSnapshot !== baseline;
  const managedByReq = Boolean((data?.form as { managed_by_requirement?: boolean } | undefined)?.managed_by_requirement);

  // Browser-level unsaved warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // In-app navigation blocker
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    withResolver: true,
    enableBeforeUnload: false,
  });
  useEffect(() => {
    if (blocker.status === "blocked") setConfirmOpen(true);
  }, [blocker.status]);

  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  function addField(type: FieldType) {
    const f = defaultFieldFor(type);
    setFields((arr) => sanitizeConditions([...arr, f]));
    setLastAddedId(f.id);
  }
  function addFieldAt(type: FieldType, afterIndex: number) {
    const f = defaultFieldFor(type);
    setFields((arr) => {
      const i = Math.max(-1, Math.min(afterIndex, arr.length - 1));
      return sanitizeConditions([...arr.slice(0, i + 1), f, ...arr.slice(i + 1)]);
    });
    setLastAddedId(f.id);
  }
  function updateField(idx: number, next: FormField) {
    setFields((arr) => sanitizeConditions(arr.map((f, i) => i === idx ? next : f)));
  }
  function move(idx: number, dir: -1 | 1) {
    setFields((arr) => {
      const next = [...arr]; const j = idx + dir;
      if (j < 0 || j >= next.length) return next;
      [next[idx], next[j]] = [next[j], next[idx]]; return sanitizeConditions(next);
    });
  }
  function removeField(idx: number) { setFields((arr) => sanitizeConditions(arr.filter((_, i) => i !== idx))); }

  async function persist(): Promise<boolean> {
    if (!name.trim()) { toast.error("Form needs a name."); return false; }
    // Per-shift tracked-data validation: "required_*" enforcement on a
    // specific-codes target needs at least one code chosen, else the form
    // would match nothing (or everything) ambiguously.
    if (
      settings.routing_behavior === "per_shift_per_client_tracked" &&
      (settings.tracking_enforcement === "required_before_clockout" ||
        settings.tracking_enforcement === "required_before_next_clockin") &&
      (settings.tracking_code_mode ?? "all") === "specific" &&
      (settings.tracking_billing_codes ?? []).length === 0
    ) {
      toast.error("Pick at least one billing code, or switch code targeting to All codes.");
      return false;
    }
    setBusy(true);
    try {
      await save({ data: {
        id: formId, name: name.trim(), description, category,
        fields, frequency, schedule,
        assigned_groups: groups, assigned_users: users,
        all_clients: allClients, assigned_clients: clients,
        settings,
      } });
      qc.invalidateQueries({ queryKey: ["form-edit", formId] });
      qc.invalidateQueries({ queryKey: ["forms-admin"] });
      toast.success("Saved");
      setIsNectarDraft(false);
      setBaseline(JSON.stringify({
        name, description, category, fields, frequency, schedule,
        groups, users, allClients, clients, settings,
      }));
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally { setBusy(false); }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/dashboard/forms" })}><ChevronLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Form builder</h1>
            <p className="text-xs text-muted-foreground">{data?.form?.status ?? "draft"} · {describeFrequency(frequency, schedule)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DirtyBadge isDirty={isDirty} />
          <Button variant="outline" onClick={() => setShowNectar(true)}><Sparkles className="mr-1.5 h-4 w-4 text-amber-500" /> Build with Nectar</Button>
          <Button variant="outline" onClick={() => setShowSettings(true)}><SettingsIcon className="mr-1.5 h-4 w-4" /> Settings</Button>
          <Button variant="outline" onClick={() => setShowAssign(true)} disabled={managedByReq}
            title={managedByReq ? "Audience is managed by the linked requirement" : undefined}
          ><Users className="mr-1.5 h-4 w-4" /> Assign</Button>
          <Button variant="outline" className="text-rose-700 hover:text-rose-800 hover:bg-rose-50 border-rose-200"
            onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
          <Button onClick={persist} disabled={busy}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
          <Button variant="default" className="bg-[#137182] hover:bg-[#0e5a68]"
            onClick={async () => { const ok = await persist(); if (ok) setShowPublish(true); }}>
            <Send className="mr-1.5 h-4 w-4" /> Publish
          </Button>
        </div>
      </div>

      {isNectarDraft && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Sparkles className="inline h-4 w-4 mr-1" /> <strong>Nectar draft</strong> — review and edit every field before publishing.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        {/* Builder */}
        <div className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="grid gap-1.5"><Label className="text-xs">Form name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} /></div>
            <div className="grid gap-1.5"><Label className="text-xs">Short description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} /></div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label className="text-xs flex items-center gap-1"><FolderTree className="h-3.5 w-3.5" /> Files under</Label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {FORM_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground">Always lives in Records → Forms. Choosing a category adds it under that section too.</p>
                {category === "intake" && (
                  <div className="grid gap-2 mt-2 rounded-md border border-border/60 bg-muted/30 p-3">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Intake subcategory (controls order in runner)</Label>
                      <select
                        value={settings.subcategory ?? ""}
                        onChange={(e) => setSettings((s) => ({ ...s, subcategory: (e.target.value || undefined) as FormSettings["subcategory"] }))}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">— None —</option>
                        <option value="application">Application / Intake Assessment</option>
                        <option value="independence">Independence Levels Assessment</option>
                        <option value="consent">Consents</option>
                        <option value="pnp_attestation">Policies & Procedures Attestation</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={!!settings.required_for_intake}
                        onChange={(e) => setSettings((s) => ({ ...s, required_for_intake: e.target.checked }))}
                      />
                      <span>
                        <strong>Required for client intake</strong>
                        <span className="block text-[11px] text-muted-foreground">
                          Adds a <em>Company-required</em> item to the client intake checklist for this org.
                          This is your company's own requirement — not auto-derived from regulations.
                        </span>
                      </span>
                    </label>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Purpose / intent (what this form is for)</Label>
                      <Textarea
                        rows={2}
                        maxLength={500}
                        placeholder="e.g. Captures guardian consent for medication administration before admission."
                        value={settings.purpose ?? ""}
                        onChange={(e) => setSettings((s) => ({ ...s, purpose: e.target.value }))}
                      />
                      <p className="text-[11px] text-muted-foreground">Shown to staff in the intake runner and to auditors on the checklist.</p>
                    </div>
                  </div>
                )}
              </div>
              <FrequencyControl frequency={frequency} schedule={schedule} setFrequency={setFrequency} setSchedule={setSchedule} />
            </div>
          </Card>

          <RoutingBehaviorCard
            name={name}
            fields={fields}
            settings={settings}
            setSettings={setSettings}
            allClients={allClients}
            clientsCount={clients.length}
          />


          <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed border-border bg-muted/30 p-2">
            {TYPE_GROUPS.map((g) => (
              <div key={g.name} className="flex flex-wrap gap-1 items-center">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-1.5">{g.name}</span>
                {g.types.map((t) => (
                  <Button key={t} size="sm" variant="outline" className="h-7 text-xs min-h-[36px]" onClick={() => addField(t)}>
                    <Plus className="h-3 w-3 mr-1" /> {TYPE_LABEL[t]}
                  </Button>
                ))}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {fields.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Add a field from the palette above, or click <strong>Build with Nectar</strong>.
              </div>
            ) : (
              <SortableFields
                fields={fields}
                setFields={(next) => setFields(next)}
                lastAddedId={lastAddedId}
                onLastAddedConsumed={() => setLastAddedId(null)}
                typeGroups={TYPE_GROUPS}
                typeLabel={TYPE_LABEL}
                onInsertAt={addFieldAt}
              />
            )}
          </div>

        </div>

        {/* Live preview + admin map */}
        <aside className="space-y-3">
          <Card className="p-3 bg-[#0B1126] text-white">
            <p className="text-[10px] uppercase tracking-wider text-white/60">Live staff preview</p>
            <p className="font-semibold text-sm mt-0.5 truncate">{name || "Untitled form"}</p>
          </Card>
          <Card className="p-4 max-h-[60vh] overflow-y-auto space-y-3 bg-white">
            {fields.length === 0
              ? <p className="text-xs text-center text-muted-foreground">Preview will appear here.</p>
              : <LivePreview fields={fields} />}
          </Card>

          <Card className="p-3 text-xs space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5"><FolderTree className="h-3.5 w-3.5" /> On the admin side</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Records → Forms (always)</li>
              <li>• {FORM_CATEGORIES.find((c) => c.value === category)?.label}</li>
              <li>• Staff: <Badge variant="outline" className="text-[10px]">{(groups.length || users.length) ? `${groups.length} groups · ${users.length} staff` : "Not assigned"}</Badge></li>
              <li>• Clients: <Badge variant="outline" className="text-[10px]">{allClients ? "All clients" : `${clients.length} client${clients.length === 1 ? "" : "s"}`}</Badge></li>
              <li>• <CalendarClock className="inline h-3 w-3" /> {describeFrequency(frequency, schedule)}</li>
            </ul>
          </Card>
        </aside>
      </div>

      <NectarDraftModal open={showNectar} onOpenChange={setShowNectar} onApply={(d) => {
        setName(d.name); setDescription(d.description); setCategory(d.category);
        setFrequency(d.frequency as Frequency);
        setFields(d.fields); setIsNectarDraft(true);
      }} />
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} value={settings} onChange={setSettings} />
      <AssignModal open={showAssign} onOpenChange={setShowAssign}
        groups={groups} users={users} allClients={allClients} clients={clients}
        onChange={(g, u, ac, c) => { setGroups(g); setUsers(u); setAllClients(ac); setClients(c); }} />
      <PublishModal open={showPublish} onOpenChange={setShowPublish}
        formId={formId} formMeta={{ name, description, frequency, schedule, fields }}
        onPublished={() => { qc.invalidateQueries({ queryKey: ["form-edit", formId] }); qc.invalidateQueries({ queryKey: ["forms-admin"] }); }} />

      <DeleteFormDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        formId={formId}
        formName={name || data?.form?.name || ""}
        onDeleted={() => {
          setBaseline(currentSnapshot); // clear dirty so the unsaved guard doesn't block navigation
          qc.invalidateQueries({ queryKey: ["forms-admin"] });
          navigate({ to: "/dashboard/forms" });
        }}
      />


      {/* spacer so sticky footer doesn't cover content */}
      <div className="h-20" aria-hidden />

      {/* Sticky Save bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2">
          <DirtyBadge isDirty={isDirty} verbose />
          <div className="flex gap-2">
            <Button onClick={persist} disabled={busy || !isDirty}>
              <Save className="mr-1.5 h-4 w-4" /> {busy ? "Saving…" : isDirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o) { setConfirmOpen(false); blocker.reset?.(); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Save your changes before leaving, or discard them. You can also stay on this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setConfirmOpen(false); blocker.reset?.(); }}>Stay</Button>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); blocker.proceed?.(); }}>
              Leave without saving
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const ok = await persist();
                if (ok) { setConfirmOpen(false); blocker.proceed?.(); }
              }}
            >
              <Save className="mr-1.5 h-4 w-4" /> {busy ? "Saving…" : "Save and leave"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DirtyBadge({ isDirty, verbose }: { isDirty: boolean; verbose?: boolean }) {
  if (isDirty) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200">
        <CircleDot className="h-3 w-3" /> {verbose ? "Unsaved changes" : "Unsaved"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
      <Check className="h-3 w-3" /> {verbose ? "All changes saved" : "Saved"}
    </span>
  );
}

function LivePreview({ fields }: { fields: FormField[] }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  return (
    <>
      {fields.map((f) => {
        if (!isFieldVisible(f, answers, fields)) return null;
        return (
          <FieldRenderer
            key={f.id} field={f}
            value={answers[f.id]}
            onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))}
          />
        );
      })}
    </>
  );
}

function FrequencyControl({
  frequency, schedule, setFrequency, setSchedule,
}: {
  frequency: Frequency; schedule: Schedule;
  setFrequency: (f: Frequency) => void; setSchedule: (s: Schedule) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> How often should staff submit?</Label>
      <select value={frequency} onChange={(e) => { setFrequency(e.target.value as Frequency); setSchedule({}); }}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        <option value="as_needed">As needed</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="quarterly">Quarterly</option>
        <option value="annually">Annually</option>
      </select>
      {frequency === "daily" && (
        <div className="grid gap-1.5">
          <Label className="text-[11px]">By what time each day?</Label>
          <Input type="time" value={schedule.time ?? ""} onChange={(e) => setSchedule({ ...schedule, time: e.target.value })} />
        </div>
      )}
      {frequency === "weekly" && (
        <div className="grid gap-1.5">
          <Label className="text-[11px]">Which day of the week?</Label>
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={schedule.weekday ?? 1}
            onChange={(e) => setSchedule({ ...schedule, weekday: Number(e.target.value) })}>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </div>
      )}
      {(frequency === "monthly" || frequency === "quarterly") && (
        <div className="grid gap-1.5">
          <Label className="text-[11px]">{frequency === "monthly" ? "Which day of the month?" : "Which day of the quarter's first month?"}</Label>
          <Input type="number" min={1} max={31} value={typeof schedule.day_of_month === "number" ? schedule.day_of_month : (schedule.day_of_month === "last" ? "" : "")}
            placeholder={frequency === "monthly" ? "1–31 (or leave blank for 'Last day')" : "1–31"}
            onChange={(e) => setSchedule({ ...schedule, day_of_month: e.target.value === "" ? "last" : Math.max(1, Math.min(31, Number(e.target.value))) })} />
        </div>
      )}
      {frequency === "annually" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label className="text-[11px]">Month</Label>
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={schedule.month_of_year ?? 1}
              onChange={(e) => setSchedule({ ...schedule, month_of_year: Number(e.target.value) })}>
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((mo, i) => <option key={mo} value={i + 1}>{mo}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[11px]">Day</Label>
            <Input type="number" min={1} max={31} value={schedule.day_of_year ?? 1}
              onChange={(e) => setSchedule({ ...schedule, day_of_year: Math.max(1, Math.min(31, Number(e.target.value))) })} />
          </div>
        </div>
      )}
    </div>
  );
}

function RoutingBehaviorCard({
  name, fields, settings, setSettings, allClients, clientsCount,
}: {
  name: string;
  fields: FormField[];
  settings: FormSettings;
  setSettings: (updater: (s: FormSettings) => FormSettings) => void;
  allClients: boolean;
  clientsCount: number;
}) {
  const propose = useServerFn(nectarProposeRouting);
  const [busy, setBusy] = useState(false);
  const purpose = settings.usage_purpose ?? "";
  const chosen = settings.routing_behavior;
  const proposal = settings.routing_proposal;
  const chosenSpec = ROUTING_BEHAVIORS.find((b) => b.value === chosen);

  async function suggest() {
    if (purpose.trim().length < 5) {
      toast.error("Tell Nectar how this form will be used (a sentence or two).");
      return;
    }
    setBusy(true);
    try {
      const out = await propose({
        data: {
          purpose: purpose.trim(),
          formName: name || undefined,
          fieldLabels: fields
            .filter((f) => f.type !== "section")
            .map((f) => f.label)
            .slice(0, 60),
        },
      });
      setSettings((s) => ({ ...s, routing_proposal: out.proposal }));
      toast.success("Nectar proposed a routing behavior — review and confirm.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">How will this form be used?</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Describe the purpose in plain English. Nectar can propose a routing behavior — you always confirm or override it. Behaviors marked with a note are not yet wired; they still file safely as normal submissions.
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Purpose / intent</Label>
        <Textarea
          rows={3}
          maxLength={2000}
          placeholder='E.g. "Each staff signs this once before working with a client to confirm they understand our medication policy."'
          value={purpose}
          onChange={(e) => setSettings((s) => ({ ...s, usage_purpose: e.target.value }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={suggest} disabled={busy}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
          {busy ? "Thinking…" : proposal ? "Suggest again" : "Suggest routing"}
        </Button>
        {proposal && (
          <span className="text-[11px] text-muted-foreground">
            Last proposal: <strong>{ROUTING_BEHAVIORS.find((b) => b.value === proposal.behavior)?.label ?? proposal.behavior}</strong>
          </span>
        )}
      </div>

      {proposal && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-2">
          <p>
            <Sparkles className="inline h-3.5 w-3.5 mr-1 text-amber-600" />
            Nectar suggests <strong>{ROUTING_BEHAVIORS.find((b) => b.value === proposal.behavior)?.label}</strong>. {proposal.rationale}
          </p>
          {chosen !== proposal.behavior && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setSettings((s) => ({ ...s, routing_behavior: proposal.behavior }))}
            >
              <Check className="mr-1 h-3 w-3" /> Accept suggestion
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-1.5">
        <Label className="text-xs">Routing behavior {chosen ? "" : <span className="text-muted-foreground">(not set)</span>}</Label>
        <select
          value={chosen ?? ""}
          onChange={(e) => {
            const v = e.target.value as RoutingBehavior | "";
            setSettings((s) => ({ ...s, routing_behavior: v ? (v as RoutingBehavior) : undefined }));
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">— Choose how this form is used —</option>
          {ROUTING_BEHAVIORS.map((b) => (
            <option key={b.value} value={b.value}>{b.label}{b.wired ? "" : " (wired in a later step)"}</option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">Nectar proposes; you decide. You can always override.</p>
      </div>

      {chosenSpec && (
        <div className={`rounded-md border px-3 py-2 text-xs ${chosenSpec.wired ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          <p className="font-medium">{chosenSpec.label}</p>
          <p className="mt-0.5">{chosenSpec.implication}</p>
          {!chosenSpec.wired && (
            <p className="mt-1 italic">
              Routing for this behavior is set up in a later step; for now the form still files normally.
            </p>
          )}
        </div>
      )}

      {chosen === "staff_mandate" && (
        <>
          <div className="grid gap-1.5">
            <Label className="text-xs">Mandate scope</Label>
            <select
              value={settings.mandate_scope ?? "per_staff"}
              onChange={(e) => {
                const v = e.target.value as "per_staff" | "per_staff_per_client";
                setSettings((s) => ({ ...s, mandate_scope: v }));
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="per_staff">Per staffer (once — applies everywhere)</option>
              <option value="per_staff_per_client">Per staffer, per client (per-client scope not set up yet — treated as per-staff for now)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              “Per staffer” fits things like an annual code of conduct. Per-client scope is not set up yet — treated as per-staff for now.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Enforcement at assignment</Label>
            <select
              value={settings.mandate_enforcement ?? "warn"}
              onChange={(e) => {
                const v = e.target.value as "warn" | "block";
                setSettings((s) => ({ ...s, mandate_enforcement: v }));
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="warn">Warn (default) — admin can proceed; the override is recorded</option>
              <option value="block">Block — assignment is prevented until complete; admins/owners may override with a typed reason</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Block adds a hard stop at caseload assignment. Non-admins get no override path. EVV / clock-in / shift records are not affected.
            </p>
          </div>
        </>
      )}

      {chosen === "per_shift_per_client_tracked" && (
        <TrackedDataConfig
          settings={settings}
          setSettings={setSettings}
          allClients={allClients}
          clientsCount={clientsCount}
        />
      )}
    </Card>
  );
}

function TrackedDataConfig({
  settings, setSettings, allClients, clientsCount,
}: {
  settings: FormSettings;
  setSettings: (updater: (s: FormSettings) => FormSettings) => void;
  allClients: boolean;
  clientsCount: number;
}) {
  const codeMode = settings.tracking_code_mode ?? "all";
  const chosenCodes = settings.tracking_billing_codes ?? [];
  const enforcement = settings.tracking_enforcement ?? "optional";
  const audienceSummary = allClients
    ? "All clients"
    : clientsCount > 0
      ? `${clientsCount} specific client${clientsCount === 1 ? "" : "s"}`
      : "No clients selected yet";

  function toggleCode(code: string) {
    setSettings((s) => {
      const cur = s.tracking_billing_codes ?? [];
      const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
      return { ...s, tracking_billing_codes: next };
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Client targeting</Label>
        <div className="rounded-md border border-input bg-background px-3 py-2 text-xs flex items-center justify-between gap-3">
          <span><strong>{audienceSummary}</strong></span>
          <span className="text-muted-foreground">Change in the <em>Assign</em> step.</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Uses this form's existing client audience (all clients, or the specific clients you assign).
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Billing-code targeting</Label>
        <select
          value={codeMode}
          onChange={(e) => {
            const v = e.target.value as "all" | "specific";
            setSettings((s) => ({ ...s, tracking_code_mode: v }));
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All billing codes</option>
          <option value="specific">Specific code(s)</option>
        </select>
        {codeMode === "specific" && (
          <div className="rounded-md border border-input bg-background p-2 max-h-56 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1">
            {EVV_SERVICE_CODES.map((c) => {
              const on = chosenCodes.includes(c.code);
              return (
                <label
                  key={c.code}
                  className={`flex items-start gap-2 rounded px-2 py-1 text-xs cursor-pointer min-h-[36px] ${on ? "bg-emerald-50" : "hover:bg-muted"}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={on}
                    onChange={() => toggleCode(c.code)}
                  />
                  <span className="leading-tight">{c.label}</span>
                </label>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Form fires when a shift matches BOTH the client filter and the code filter.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Enforcement</Label>
        <select
          value={enforcement}
          onChange={(e) => {
            const v = e.target.value as FormSettings["tracking_enforcement"];
            setSettings((s) => ({ ...s, tracking_enforcement: v }));
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="optional">Optional — no prompt; staff can fill if they want</option>
          <option value="reminded">Reminded — nudge during/after shift; can skip (skip is recorded)</option>
          <option value="required_before_clockout">Required before clock-out — prompt at end of shift (never traps you)</option>
          <option value="required_before_next_clockin">Required before next clock-in — must finish before starting your next shift</option>
        </select>
        <p className="text-[11px] text-muted-foreground">
          Enforcement prompts at the punch-pad are set up in a later step — this just records your choice.
          EVV / clock-in / shift records are not affected.
        </p>
      </div>
    </div>
  );
}
