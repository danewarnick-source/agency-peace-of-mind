// Face Sheet Info — editable card that backs every Client Face Sheet field
// with a real, admin-editable data source on the `clients` row.
//
// Grouped sections: Identity & IDs, Insurance & Payment, Physical Description,
// Places Frequented, Health / Safety. All fields optional (intake never
// blocked) — present so staff can complete the record over time.
//
// Reads/writes: public.clients (RLS-scoped to org members via existing policy).

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, IdCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FIELDS = [
  // Identity & IDs
  "client_pid",
  "place_of_birth",
  "ethnic_origin",
  "religion",
  "state_id_number",
  "state_id_expires_on",
  "pcsp_signed_date",
  "intake_date",
  "medicaid_case_number",
  "medicaid_id",
  "medicare_number",
  "private_insurance",
  "payment_sources",
  "income_sources",
  // Physical
  "height_inches",
  "weight_pounds",
  "hair_color",
  "eye_color",
  "identifying_marks",
  "places_frequented",
  // Safety / Health
  "pertinent_health_notes",
  "allergies",
  "dietary_needs",
  // Providers
  "residential_provider",
  "day_program_provider",
  "physician_address",
  "dentist_address",
  "psychiatrist_name",
  "psychiatrist_phone",
  "psychiatrist_address",
  // Emergency contacts (address/relationship additions on clients row)
  "emergency_contact_relationship",
  "emergency_contact_address",
  "emergency_contact_2_relationship",
  "emergency_contact_2_address",
] as const;


const SELECT_COLS = FIELDS.join(", ");

type Row = Partial<Record<(typeof FIELDS)[number], unknown>>;

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return (v as unknown[]).map(String).join(", ");
  return String(v);
}

function toArr(v: string): string[] | null {
  const items = v.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : null;
}

function toIntOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function FaceSheetInfoCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["client-face-sheet-info", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select(SELECT_COLS as any)
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Row;
    },
  });

  useEffect(() => {
    if (!q.data) return;
    const seed: Record<string, string> = {};
    for (const k of FIELDS) seed[k] = toStr((q.data as Row)[k]);
    setForm(seed);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const patch: Record<string, unknown> = {
        client_pid: form.client_pid || null,
        place_of_birth: form.place_of_birth || null,
        ethnic_origin: form.ethnic_origin || null,
        religion: form.religion || null,
        state_id_number: form.state_id_number || null,
        state_id_expires_on: form.state_id_expires_on || null,
        medicaid_case_number: form.medicaid_case_number || null,
        medicaid_id: form.medicaid_id || null,
        medicare_number: form.medicare_number || null,
        private_insurance: form.private_insurance || null,
        payment_sources: toArr(form.payment_sources ?? ""),
        income_sources: toArr(form.income_sources ?? ""),
        height_inches: toIntOrNull(form.height_inches ?? ""),
        weight_pounds: toIntOrNull(form.weight_pounds ?? ""),
        hair_color: form.hair_color || null,
        eye_color: form.eye_color || null,
        identifying_marks: form.identifying_marks || null,
        places_frequented: form.places_frequented || null,
        pertinent_health_notes: form.pertinent_health_notes || null,
        allergies: toArr(form.allergies ?? ""),
        dietary_needs: form.dietary_needs || null,
        residential_provider: form.residential_provider || null,
        day_program_provider: form.day_program_provider || null,
        physician_address: form.physician_address || null,
        dentist_address: form.dentist_address || null,
        psychiatrist_name: form.psychiatrist_name || null,
        psychiatrist_phone: form.psychiatrist_phone || null,
        psychiatrist_address: form.psychiatrist_address || null,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("clients").update(patch as any).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Face sheet info saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["client-face-sheet-info", clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start gap-2.5 border-b border-border/60 px-5 py-4">
          <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <IdCard className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-tight">Face Sheet Info</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              All optional — completes the printable Client Face Sheet used for
              emergency and law-enforcement identification.
            </p>
          </div>
          {!editing && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(true)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="space-y-6 p-5">
          <Section title="Identity & IDs">
            <Field label="PID #" k="client_pid" form={form} set={set} editing={editing} />
            <Field label="Place of birth" k="place_of_birth" form={form} set={set} editing={editing} />
            <Field label="Ethnic origin" k="ethnic_origin" form={form} set={set} editing={editing} />
            <Field label="Religion" k="religion" form={form} set={set} editing={editing} />
            <Field label="Utah ID #" k="state_id_number" form={form} set={set} editing={editing} />
            <Field label="Utah ID expiration" k="state_id_expires_on" type="date" form={form} set={set} editing={editing} />
          </Section>

          <Section title="Insurance & Payment">
            <Field label="Medicaid case #" k="medicaid_case_number" form={form} set={set} editing={editing} />
            <Field label="Medicaid #" k="medicaid_id" form={form} set={set} editing={editing} />
            <Field label="Medicare #" k="medicare_number" form={form} set={set} editing={editing} />
            <Field label="Private health insurance" k="private_insurance" form={form} set={set} editing={editing} />
            <Field label="Payment sources (comma-separated)" k="payment_sources" form={form} set={set} editing={editing} />
            <Field label="Income sources (comma-separated)" k="income_sources" form={form} set={set} editing={editing} />
          </Section>

          <Section title="Physical description">
            <Field label="Height (inches)" k="height_inches" type="number" form={form} set={set} editing={editing} />
            <Field label="Weight (lbs)" k="weight_pounds" type="number" form={form} set={set} editing={editing} />
            <Field label="Hair color" k="hair_color" form={form} set={set} editing={editing} />
            <Field label="Eye color" k="eye_color" form={form} set={set} editing={editing} />
            <Field label="Identifying marks / scars / tattoos" k="identifying_marks" multiline form={form} set={set} editing={editing} full />
            <Field label="Places frequented / known locations" k="places_frequented" multiline form={form} set={set} editing={editing} full />
          </Section>

          <Section title="Health & Safety">
            <Field label="Pertinent health info" k="pertinent_health_notes" multiline form={form} set={set} editing={editing} full />
            <Field label="Allergies (comma-separated)" k="allergies" form={form} set={set} editing={editing} full />
            <Field label="Special dietary needs" k="dietary_needs" multiline form={form} set={set} editing={editing} full />
          </Section>

          <Section title="Providers & Services">
            <Field label="Residential provider" k="residential_provider" form={form} set={set} editing={editing} />
            <Field label="Day program / agency" k="day_program_provider" form={form} set={set} editing={editing} />
            <Field label="Physician address" k="physician_address" multiline form={form} set={set} editing={editing} full />
            <Field label="Dentist address" k="dentist_address" multiline form={form} set={set} editing={editing} full />
            <Field label="Psychiatrist name" k="psychiatrist_name" form={form} set={set} editing={editing} />
            <Field label="Psychiatrist phone" k="psychiatrist_phone" form={form} set={set} editing={editing} />
            <Field label="Psychiatrist address" k="psychiatrist_address" multiline form={form} set={set} editing={editing} full />
          </Section>

          {editing && (
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground/80">
        {title}
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label, k, type = "text", multiline, full, editing, form, set,
}: {
  label: string;
  k: string;
  type?: string;
  multiline?: boolean;
  full?: boolean;
  editing: boolean;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  const val = form[k] ?? "";
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {editing ? (
        multiline ? (
          <Textarea
            className="mt-1 min-h-[68px] text-sm"
            value={val}
            onChange={(e) => set(k, e.target.value)}
          />
        ) : (
          <Input
            className="mt-1 h-9 text-sm"
            type={type}
            value={val}
            onChange={(e) => set(k, e.target.value)}
          />
        )
      ) : (
        <div className="mt-1 min-h-[36px] whitespace-pre-wrap rounded-md border border-border/40 bg-muted/20 px-3 py-1.5 text-sm">
          {val || <span className="text-muted-foreground">Not on file</span>}
        </div>
      )}
    </div>
  );
}
