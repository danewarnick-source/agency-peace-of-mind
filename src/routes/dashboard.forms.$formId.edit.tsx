import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Save, Sparkles, Plus, ChevronLeft, Settings as SettingsIcon, Users, FolderTree, CalendarClock, Send,
} from "lucide-react";
import { getForm, saveForm } from "@/lib/forms.functions";
import {
  type FormField, type FieldType, type Frequency, type Schedule, type FormSettings,
  defaultFieldFor, FORM_CATEGORIES, describeFrequency, sanitizeConditions, isFieldVisible,
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

  useEffect(() => {
    const f = data?.form;
    if (!f) return;
    setName(f.name ?? ""); setDescription(f.description ?? "");
    setCategory(f.category ?? "general");
    setFields(Array.isArray(f.fields) ? f.fields : []);
    setFrequency(f.frequency ?? "as_needed");
    setSchedule(f.schedule ?? {});
    setGroups(f.assigned_groups ?? []);
    setUsers(f.assigned_users ?? []);
    setAllClients(f.all_clients ?? true);
    setClients(f.assigned_clients ?? []);
    setSettings(f.settings ?? {});
  }, [data]);

  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  function addField(type: FieldType) {
    const f = defaultFieldFor(type);
    setFields((arr) => sanitizeConditions([...arr, f]));
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowNectar(true)}><Sparkles className="mr-1.5 h-4 w-4 text-amber-500" /> Build with Nectar</Button>
          <Button variant="outline" onClick={() => setShowSettings(true)}><SettingsIcon className="mr-1.5 h-4 w-4" /> Settings</Button>
          <Button variant="outline" onClick={() => setShowAssign(true)}><Users className="mr-1.5 h-4 w-4" /> Assign</Button>
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
              <SortableFields fields={fields} setFields={(next) => setFields(next)} lastAddedId={lastAddedId} onLastAddedConsumed={() => setLastAddedId(null)} />
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
    </div>
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
