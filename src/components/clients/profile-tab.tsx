// Profile tab — the SOW §1.10 record at-a-glance.
//
// Read mode = clean label/value rows (no input chrome). Each editable card
// has a pencil that flips it to inputs with Save/Cancel. All writes go to
// real columns documented in the prompt. Custom attributes, EVV, mailing/
// service addresses, and level of need are intentionally absent here.

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, Pencil, Plus, Upload, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ClientRow = Record<string, unknown>;
type DocRow = { id: string; document_type: string | null; file_name: string | null; storage_path: string | null; uploaded_at: string | null };

// Required SOW §1.10 record types surfaced in the completeness bar.
type RecKey = "pcsp" | "photograph" | "grievance_acknowledgment" | "guardian" | "hrc_approval" | "dnr";
const RECORD_LABELS: Record<RecKey, { title: string; sub: string }> = {
  pcsp: { title: "Person-Centered Plan", sub: "Annual; renews each year" },
  photograph: { title: "Photograph", sub: "Current likeness on file" },
  grievance_acknowledgment: { title: "Grievance acknowledgment", sub: "Signed by client / guardian" },
  guardian: { title: "Guardianship docs", sub: "Letter or court order" },
  hrc_approval: { title: "HRC / rights restriction", sub: "Required when rights are restricted" },
  dnr: { title: "DNR order", sub: "Only if applicable" },
};

export function ClientProfileTab({ clientId, onOpenFiles }: { clientId: string; onOpenFiles: () => void }) {
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const clientQ = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-tab", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "id, first_name, last_name, medicaid_id, date_of_birth, phone_number, is_own_guardian, guardian_name, guardian_phone, support_coordinator_name, support_coordinator_phone, support_coordinator_email, admission_date, discharge_date, diagnoses, primary_care_name, special_directions, dnr_status, account_status, pcsp_expiration_date, rights_restrictions" as any,
        )
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as ClientRow | null;
    },
  });

  const docsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-tab-docs", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents")
        .select("id, document_type, file_name, storage_path, uploaded_at")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  const contactsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["client-emergency-contacts", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_emergency_contacts")
        .select("id, name, phone, relationship")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; phone: string | null; relationship: string | null }[];
    },
  });

  const client = clientQ.data ?? null;
  const docs = docsQ.data ?? [];
  const contacts = contactsQ.data ?? [];

  if (clientQ.isLoading || !client) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <RecordCompletenessBar
        client={client}
        docs={docs}
        onOpenFiles={onOpenFiles}
        onContinueIntake={() => navigate({ to: "/dashboard/client-intake/$clientId", params: { clientId } })}
      />

      <ClinicalAlertBanner clientId={clientId} client={client} />

      <div className="grid gap-4 lg:grid-cols-2">
        <IdentityCard clientId={clientId} client={client} />
        <div className="space-y-4">
          <ContactsCard clientId={clientId} orgId={orgId!} contacts={contacts} />
          <AtGlanceCard clientId={clientId} client={client} />
        </div>
      </div>

      <RetentionFooter clientId={clientId} status={(client.account_status as string | null) ?? "active"} />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function age(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  // ISO date → MM/DD/YYYY for compactness
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{children ?? <span className="text-muted-foreground font-normal">—</span>}</span>
    </div>
  );
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 first:mt-0">{children}</div>;
}

function CardShell({
  title, subtitle, editing, onEdit, onSave, onCancel, saving, children, headerRight,
}: {
  title: string;
  subtitle?: string;
  editing?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
            {onEdit && !editing ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div>{children}</div>
        {editing ? (
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Record completeness bar ────────────────────────────────────────────────

function RecordCompletenessBar({
  client, docs, onOpenFiles, onContinueIntake,
}: { client: ClientRow; docs: DocRow[]; onOpenFiles: () => void; onContinueIntake: () => void }) {
  const [open, setOpen] = useState(false);

  const isOwnGuardian = client.is_own_guardian === true;
  const hasRightsRestrictions = Array.isArray(client.rights_restrictions) && (client.rights_restrictions as string[]).length > 0;
  const dnrStatus = (client.dnr_status as string | null) ?? null;

  type RecState = "ok" | "missing" | "na";
  function stateFor(key: RecKey): { state: RecState; doc?: DocRow } {
    const doc = docs.find((d) => d.document_type === key);
    if (key === "guardian" && isOwnGuardian) return { state: "na" };
    if (key === "hrc_approval" && !hasRightsRestrictions) return { state: "na" };
    if (key === "dnr") {
      if (doc) return { state: "ok", doc };
      if (dnrStatus === "none" || dnrStatus === "not_applicable" || dnrStatus == null) return { state: "na" };
      return { state: "missing" };
    }
    return doc ? { state: "ok", doc } : { state: "missing" };
  }

  const keys: RecKey[] = ["pcsp", "photograph", "grievance_acknowledgment", "guardian", "hrc_approval", "dnr"];
  const states = keys.map((k) => ({ key: k, ...stateFor(k) }));
  const applicable = states.filter((s) => s.state !== "na");
  const completed = applicable.filter((s) => s.state === "ok").length;
  const required = applicable.length;
  const missing = required - completed;
  const pct = required ? Math.round((completed / required) * 100) : 100;
  const allDone = missing === 0;

  async function openDoc(doc?: DocRow) {
    if (!doc?.storage_path) { onOpenFiles(); return; }
    try {
      const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(doc.storage_path, 60);
      if (error || !data?.signedUrl) throw error ?? new Error("No URL");
      window.open(data.signedUrl, "_blank");
    } catch {
      onOpenFiles();
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-3 text-left"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Record</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className={cn("h-full transition-all", allDone ? "bg-green-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {allDone ? "Record complete" : `${completed} of ${required} required complete`}
          </span>
          {!allDone ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {missing} missing
            </span>
          ) : null}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {open ? (
          <div className="mt-4 pt-4 border-t space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Records & documents</div>
            {states.map(({ key, state, doc }) => {
              const label = RECORD_LABELS[key];
              return (
                <div key={key} className="flex items-center gap-3 py-1.5">
                  <div
                    className={cn(
                      "h-6 w-6 rounded grid place-items-center text-xs font-bold flex-none",
                      state === "ok" && "bg-green-100 text-green-700",
                      state === "missing" && "bg-amber-100 text-amber-700",
                      state === "na" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {state === "ok" ? <Check className="h-3.5 w-3.5" /> : state === "missing" ? "!" : "–"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{label.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{label.sub}</div>
                  </div>
                  {state === "ok" ? (
                    <Button size="sm" variant="outline" onClick={() => openDoc(doc)}>View</Button>
                  ) : state === "missing" ? (
                    <Button size="sm" variant="outline" onClick={onOpenFiles}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground px-2">N/A</span>
                  )}
                </div>
              );
            })}
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button variant="outline" size="sm" onClick={onContinueIntake}>Continue intake</Button>
              <Button size="sm" onClick={onOpenFiles}>Open Files</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Clinical alert banner ─────────────────────────────────────────────────

function ClinicalAlertBanner({ clientId, client }: { clientId: string; client: ClientRow }) {
  const qc = useQueryClient();
  const initial = (client.special_directions as string | null) ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("clients").update({ special_directions: draft.trim() || null }).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clinical alert updated.");
      qc.invalidateQueries({ queryKey: ["client-profile-tab"] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!initial && !editing) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-none mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Clinical Alert</div>
          {editing ? (
            <textarea
              className="mt-2 w-full min-h-[80px] rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{initial}</p>
          )}
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setDraft(initial); setEditing(false); }}>Cancel</Button>
            <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setDraft(initial); setEditing(true); }}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Identity & contact ─────────────────────────────────────────────────────

function IdentityCard({ clientId, client }: { clientId: string; client: ClientRow }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const baseline = () => ({
    first_name: (client.first_name as string) ?? "",
    last_name: (client.last_name as string) ?? "",
    medicaid_id: (client.medicaid_id as string) ?? "",
    date_of_birth: (client.date_of_birth as string) ?? "",
    phone_number: (client.phone_number as string) ?? "",
    is_own_guardian: client.is_own_guardian === true,
    guardian_name: (client.guardian_name as string) ?? "",
    guardian_phone: (client.guardian_phone as string) ?? "",
    support_coordinator_name: (client.support_coordinator_name as string) ?? "",
    support_coordinator_phone: (client.support_coordinator_phone as string) ?? "",
    support_coordinator_email: (client.support_coordinator_email as string) ?? "",
    admission_date: (client.admission_date as string) ?? "",
    discharge_date: (client.discharge_date as string) ?? "",
  });
  const [draft, setDraft] = useState(baseline);
  const set = <K extends keyof ReturnType<typeof baseline>>(k: K, v: ReturnType<typeof baseline>[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        first_name: draft.first_name.trim() || null,
        last_name: draft.last_name.trim() || null,
        medicaid_id: draft.medicaid_id.trim() || null,
        date_of_birth: draft.date_of_birth || null,
        phone_number: draft.phone_number.trim() || null,
        is_own_guardian: draft.is_own_guardian,
        guardian_name: draft.is_own_guardian ? null : (draft.guardian_name.trim() || null),
        guardian_phone: draft.is_own_guardian ? null : (draft.guardian_phone.trim() || null),
        support_coordinator_name: draft.support_coordinator_name.trim() || null,
        support_coordinator_phone: draft.support_coordinator_phone.trim() || null,
        support_coordinator_email: draft.support_coordinator_email.trim() || null,
        admission_date: draft.admission_date || null,
        discharge_date: draft.discharge_date || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("clients").update(payload as any).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved.");
      qc.invalidateQueries({ queryKey: ["client-profile-tab"] });
      qc.invalidateQueries({ queryKey: ["client-profile"] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const a = age(client.date_of_birth as string | null);
  const dob = fmtDate(client.date_of_birth as string | null);
  const dobAge = client.date_of_birth ? `${dob}${a != null ? ` · ${a}` : ""}` : null;

  const guardianValue = client.is_own_guardian === true
    ? "Self-guardian"
    : client.guardian_name
      ? `Has guardian · ${client.guardian_name}${client.guardian_phone ? ` · ${client.guardian_phone}` : ""}`
      : null;

  return (
    <CardShell
      title="Identity & contact"
      editing={editing}
      onEdit={() => { setDraft(baseline()); setEditing(true); }}
      onSave={() => mut.mutate()}
      onCancel={() => setEditing(false)}
      saving={mut.isPending}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-3 pb-3 border-b mb-2">
          <div className="h-14 w-14 rounded-full bg-muted grid place-items-center text-muted-foreground text-xs">Photo</div>
          <div className="text-xs text-muted-foreground">Profile photo — upload (coming soon)</div>
        </div>

        {!editing ? (
          <>
            <GroupHeader>Person</GroupHeader>
            <Row label="Name">{`${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || null}</Row>
            <Row label="Individual Medicaid ID">{(client.medicaid_id as string) || null}</Row>
            <Row label="Guardian">{guardianValue}</Row>
            <Row label="Date of birth">{dobAge}</Row>
            <Row label="Phone">{(client.phone_number as string) || null}</Row>

            <GroupHeader>Support Coordinator</GroupHeader>
            <Row label="Name">{(client.support_coordinator_name as string) || null}</Row>
            <Row label="Phone">{(client.support_coordinator_phone as string) || null}</Row>
            <Row label="Email">{(client.support_coordinator_email as string) || null}</Row>

            <GroupHeader>Enrollment</GroupHeader>
            <Row label="Admitted">{fmtDate(client.admission_date as string | null)}</Row>
            <Row label="Discharge date">{client.discharge_date ? fmtDate(client.discharge_date as string) : <span className="text-muted-foreground italic font-normal">— active —</span>}</Row>
          </>
        ) : (
          <div className="space-y-4">
            <div>
              <GroupHeader>Person</GroupHeader>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <LabeledInput label="First name" value={draft.first_name} onChange={(v) => set("first_name", v)} />
                <LabeledInput label="Last name" value={draft.last_name} onChange={(v) => set("last_name", v)} />
                <LabeledInput label="Medicaid ID" value={draft.medicaid_id} onChange={(v) => set("medicaid_id", v)} />
                <LabeledInput label="Date of birth" type="date" value={draft.date_of_birth} onChange={(v) => set("date_of_birth", v)} />
                <LabeledInput label="Phone" value={draft.phone_number} onChange={(v) => set("phone_number", v)} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Switch checked={draft.is_own_guardian} onCheckedChange={(v) => set("is_own_guardian", v)} id="self-guardian" />
                <Label htmlFor="self-guardian" className="text-sm">Self-guardian</Label>
              </div>
              {!draft.is_own_guardian ? (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <LabeledInput label="Guardian name" value={draft.guardian_name} onChange={(v) => set("guardian_name", v)} />
                  <LabeledInput label="Guardian phone" value={draft.guardian_phone} onChange={(v) => set("guardian_phone", v)} />
                </div>
              ) : null}
            </div>

            <div>
              <GroupHeader>Support Coordinator</GroupHeader>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <LabeledInput label="Name" value={draft.support_coordinator_name} onChange={(v) => set("support_coordinator_name", v)} />
                <LabeledInput label="Phone" value={draft.support_coordinator_phone} onChange={(v) => set("support_coordinator_phone", v)} />
                <LabeledInput label="Email" value={draft.support_coordinator_email} onChange={(v) => set("support_coordinator_email", v)} />
              </div>
            </div>

            <div>
              <GroupHeader>Enrollment</GroupHeader>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <LabeledInput label="Admitted" type="date" value={draft.admission_date} onChange={(v) => set("admission_date", v)} />
                <LabeledInput label="Discharge date" type="date" value={draft.discharge_date} onChange={(v) => set("discharge_date", v)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </CardShell>
  );
}

function LabeledInput({ label, value, onChange, type }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input type={type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ── Contacts ───────────────────────────────────────────────────────────────

type ContactDraft = { id?: string; name: string; phone: string; relationship: string; _deleted?: boolean };

function ContactsCard({
  clientId, orgId, contacts,
}: { clientId: string; orgId: string; contacts: { id: string; name: string; phone: string | null; relationship: string | null }[] }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const baseline = (): ContactDraft[] => contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? "", relationship: c.relationship ?? "" }));
  const [draft, setDraft] = useState<ContactDraft[]>(baseline);

  const mut = useMutation({
    mutationFn: async () => {
      const ops: Promise<unknown>[] = [];
      for (const c of draft) {
        if (c._deleted && c.id) {
          ops.push(supabase.from("client_emergency_contacts").delete().eq("id", c.id).then((r) => { if (r.error) throw r.error; }));
        } else if (!c._deleted) {
          const name = c.name.trim();
          if (!name) continue;
          const payload = { organization_id: orgId, client_id: clientId, name, phone: c.phone.trim() || null, relationship: c.relationship.trim() || null };
          if (c.id) {
            ops.push(supabase.from("client_emergency_contacts").update(payload).eq("id", c.id).then((r) => { if (r.error) throw r.error; }));
          } else {
            ops.push(supabase.from("client_emergency_contacts").insert(payload).then((r) => { if (r.error) throw r.error; }));
          }
        }
      }
      await Promise.all(ops);
    },
    onSuccess: () => {
      toast.success("Contacts updated.");
      qc.invalidateQueries({ queryKey: ["client-emergency-contacts"] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CardShell
      title="Contacts"
      subtitle="Who to call if something happens on shift."
      editing={editing}
      onEdit={() => { setDraft(baseline()); setEditing(true); }}
      onSave={() => mut.mutate()}
      onCancel={() => setEditing(false)}
      saving={mut.isPending}
    >
      {!editing ? (
        contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No emergency contacts on file.</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-1">
                <div className="h-9 w-9 rounded bg-muted grid place-items-center text-xs font-semibold flex-none">{initials(c.name) || "?"}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  {c.relationship ? <div className="text-xs text-muted-foreground truncate">{c.relationship}</div> : null}
                </div>
                <div className="text-sm text-right">{c.phone || <span className="text-muted-foreground">—</span>}</div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-2">
          {draft.map((c, i) => c._deleted ? null : (
            <div key={c.id ?? `new-${i}`} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <LabeledInput label="Name" value={c.name} onChange={(v) => setDraft((d) => d.map((x, j) => j === i ? { ...x, name: v } : x))} />
              <LabeledInput label="Phone" value={c.phone} onChange={(v) => setDraft((d) => d.map((x, j) => j === i ? { ...x, phone: v } : x))} />
              <LabeledInput label="Relationship" value={c.relationship} onChange={(v) => setDraft((d) => d.map((x, j) => j === i ? { ...x, relationship: v } : x))} />
              <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setDraft((d) => d.map((x, j) => j === i ? { ...x, _deleted: true } : x))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setDraft((d) => [...d, { name: "", phone: "", relationship: "" }])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add contact
          </Button>
        </div>
      )}
    </CardShell>
  );
}

// ── At a glance ────────────────────────────────────────────────────────────

function AtGlanceCard({ clientId, client }: { clientId: string; client: ClientRow }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const diagnoses = Array.isArray(client.diagnoses) ? (client.diagnoses as string[]) : [];
  const primaryDx = diagnoses[0] ?? "";
  const baseline = () => ({
    primary_dx: primaryDx,
    primary_care_name: (client.primary_care_name as string) ?? "",
    pcsp_expiration_date: (client.pcsp_expiration_date as string) ?? "",
  });
  const [draft, setDraft] = useState(baseline);

  const mut = useMutation({
    mutationFn: async () => {
      const newDx = draft.primary_dx.trim();
      const updatedDiagnoses = newDx
        ? [newDx, ...diagnoses.slice(1)]
        : diagnoses.slice(1);
      const { error } = await supabase.from("clients").update({
        diagnoses: updatedDiagnoses,
        primary_care_name: draft.primary_care_name.trim() || null,
        pcsp_expiration_date: draft.pcsp_expiration_date || null,
      }).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved.");
      qc.invalidateQueries({ queryKey: ["client-profile-tab"] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pcspExp = (client.pcsp_expiration_date as string | null) ?? null;
  const pcspWarn = useMemo(() => {
    if (!pcspExp) return false;
    const exp = new Date(pcspExp);
    const ms = exp.getTime() - Date.now();
    return ms < 30 * 24 * 3600 * 1000;
  }, [pcspExp]);

  return (
    <CardShell
      title="At a glance"
      editing={editing}
      onEdit={() => { setDraft(baseline()); setEditing(true); }}
      onSave={() => mut.mutate()}
      onCancel={() => setEditing(false)}
      saving={mut.isPending}
    >
      {!editing ? (
        <>
          <Row label="Primary diagnosis">{primaryDx || null}</Row>
          <Row label="Primary care">{(client.primary_care_name as string) || null}</Row>
          <Row label="PCSP expiration">
            {pcspExp ? (
              <span className={cn("inline-flex items-center gap-1", pcspWarn && "text-red-600 font-semibold")}>
                {pcspWarn ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                {fmtDate(pcspExp)}
              </span>
            ) : (
              <span className="text-muted-foreground italic font-normal">Set expiration</span>
            )}
          </Row>
          <Row label="Admitted">{fmtDate(client.admission_date as string | null)}</Row>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <LabeledInput label="Primary diagnosis" value={draft.primary_dx} onChange={(v) => setDraft((d) => ({ ...d, primary_dx: v }))} />
          <LabeledInput label="Primary care" value={draft.primary_care_name} onChange={(v) => setDraft((d) => ({ ...d, primary_care_name: v }))} />
          <LabeledInput label="PCSP expiration" type="date" value={draft.pcsp_expiration_date} onChange={(v) => setDraft((d) => ({ ...d, pcsp_expiration_date: v }))} />
        </div>
      )}
    </CardShell>
  );
}

// ── Record retention footer ────────────────────────────────────────────────

function RetentionFooter({ clientId, status }: { clientId: string; status: string }) {
  const qc = useQueryClient();
  const isArchived = status === "archived";
  const mut = useMutation({
    mutationFn: async () => {
      const next = isArchived ? "active" : "archived";
      const { error } = await supabase.from("clients").update({ account_status: next }).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isArchived ? "Client reactivated." : "Client archived.");
      qc.invalidateQueries({ queryKey: ["client-profile-tab"] });
      qc.invalidateQueries({ queryKey: ["client-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border bg-muted/30 p-4 flex items-start justify-between gap-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Record retention</div>
        <p className="text-sm text-muted-foreground mt-1">
          Medicaid requires client records be kept for 7 years. A client can be archived (hidden from active lists) but the record is never deleted.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
        {isArchived ? "Reactivate client" : "Archive client"}
      </Button>
    </div>
  );
}
