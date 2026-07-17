import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Heart,
  MapPin,
  Phone,
  Target,
  User,
} from "lucide-react";
import type { CaseloadClient } from "@/hooks/use-caseload";
import { ClientPhotoCard } from "@/components/clients/client-photo-card";
import { useClientCareData } from "@/hooks/use-client-care-data";
import type { CustomFieldWithValue } from "@/lib/client-care-data.functions";

function formatCustomValue(f: CustomFieldWithValue): string {
  const v = f.value;
  if (!v) return "—";
  switch (f.data_type) {
    case "text": return v.value_text ?? "—";
    case "number": return v.value_number == null ? "—" : String(v.value_number);
    case "boolean": return v.value_boolean ? "Yes" : "No";
    case "date": return v.value_date ?? "—";
  }
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

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

function isEmpty(v: React.ReactNode): boolean {
  return v == null || v === "" || v === false;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (isEmpty(children)) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm border-b border-border/60 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-right">{children}</span>
    </div>
  );
}

function Group({ header, children }: { header: string; children: React.ReactNode }) {
  const rendered = (Array.isArray(children) ? children : [children]).filter(
    (c) => c !== null && c !== false && c !== undefined,
  );
  if (rendered.length === 0) return null;
  return (
    <>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground/80 mt-4 mb-1.5 first:mt-0">
        {header}
      </div>
      {rendered}
    </>
  );
}


export function AboutTab({ client }: { client: CaseloadClient }) {
  const care = useClientCareData(client.id);
  const staffCare = care.data?.visibility.staffCare;
  const identity = staffCare?.identity;

  const customFields = staffCare?.custom_fields ?? [];
  const identityCustom = customFields.filter((f) => f.section === "identity");
  const carePlanCustom = customFields.filter((f) => f.section === "care_plan");

  const goals = (staffCare?.goals ?? []).map((g) => g.goal).filter(Boolean);

  const fullName = `${identity?.first_name ?? client.first_name ?? ""} ${identity?.last_name ?? client.last_name ?? ""}`.trim();
  const dob = identity?.date_of_birth ?? null;
  const dobAge = dob ? `${fmtDate(dob)}${age(dob) != null ? ` · ${age(dob)}` : ""}` : null;

  const guardianValue = identity?.is_own_guardian === true
    ? "Self-guardian"
    : identity?.guardian_name
      ? `${identity.guardian_name}${identity.guardian_phone ? ` · ${identity.guardian_phone}` : ""}`
      : null;

  const primaryDx = identity?.diagnoses?.[0] ?? null;
  const pcspExp = identity?.pcsp_expiration_date ?? null;
  const pcspWarn = (() => {
    if (!pcspExp) return false;
    const d = new Date(pcspExp);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() - Date.now() < 30 * 24 * 3600 * 1000;
  })();

  const specialDirections = identity?.special_directions ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Clinical alert */}
      {specialDirections && (
        <div className="md:col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-none mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Clinical Alert</div>
              <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{specialDirections}</p>
            </div>
          </div>
        </div>
      )}

      {/* Identity header */}
      <Card className="p-5 md:col-span-2">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
          <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <User className="h-10 w-10" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Active Individual
            </p>
            <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">{fullName}</h2>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {client.physical_address ?? "Address on file with administrator"}
            </p>
          </div>
        </div>
      </Card>

      {/* Identity & contact */}
      <Card className="p-5 md:col-span-2">
        <h3 className="mb-1 text-sm font-semibold">Identity & contact</h3>
        <Group header="Person">
          <Row label="Name">{fullName || null}</Row>
          <Row label="Individual Medicaid ID">{identity?.medicaid_id || null}</Row>
          <Row label="Guardian">{guardianValue}</Row>
          <Row label="Date of birth">{dobAge}</Row>
          <Row label="Phone">{identity?.phone_number || null}</Row>
        </Group>

        <Group header="Support Coordinator">
          <Row label="Name">{identity?.support_coordinator_name || null}</Row>
          <Row label="Phone">
            {identity?.support_coordinator_phone ? (
              <a href={`tel:${identity.support_coordinator_phone}`} className="text-primary hover:underline">
                {identity.support_coordinator_phone}
              </a>
            ) : null}
          </Row>
          <Row label="Email">
            {identity?.support_coordinator_email ? (
              <a href={`mailto:${identity.support_coordinator_email}`} className="text-primary hover:underline break-all">
                {identity.support_coordinator_email}
              </a>
            ) : null}
          </Row>
        </Group>

        <Group header="Enrollment">
          <Row label="Admitted">{identity?.admission_date ? fmtDate(identity.admission_date) : null}</Row>
          <Row label="Discharge date">
            {identity?.admission_date || identity?.discharge_date
              ? (identity?.discharge_date
                  ? fmtDate(identity.discharge_date)
                  : <span className="text-muted-foreground italic font-normal">— active —</span>)
              : null}
          </Row>
        </Group>

        <Group header="Flags">
          <Row label="Acquired brain injury (ABI)">{identity?.has_abi ? "Yes — staff need ABI training" : null}</Row>
          <Row label="Human Rights documentation">{identity?.hr_applicable ? "Applicable" : null}</Row>
          <Row label="DNR order">{identity?.dnr_applicable ? "On — document on file" : null}</Row>
        </Group>

        {identityCustom.length > 0 && (
          <Group header="Additional">
            {identityCustom.map((f) => {
              const v = formatCustomValue(f);
              return v && v !== "—" ? (
                <Row key={f.id} label={f.field_label}>{v}</Row>
              ) : null;
            })}
          </Group>
        )}
      </Card>

      {/* At a glance */}
      {(primaryDx || identity?.primary_care_name || pcspExp || identity?.admission_date) && (
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-semibold">At a glance</h3>
          <Row label="Primary diagnosis">{primaryDx}</Row>
          <Row label="Primary care">{identity?.primary_care_name || null}</Row>
          <Row label="PCSP expiration">
            {pcspExp ? (
              <span className={cn("inline-flex items-center gap-1", pcspWarn && "text-red-600 font-semibold")}>
                {pcspWarn ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                {fmtDate(pcspExp)}
              </span>
            ) : null}
          </Row>
          <Row label="Admitted">{identity?.admission_date ? fmtDate(identity.admission_date) : null}</Row>
        </Card>
      )}


      {/* Emergency contacts */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Phone className="h-3.5 w-3.5" /> Emergency Contacts
        </h3>
        {(staffCare?.emergency_contacts ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(staffCare?.emergency_contacts ?? []).map((c) => (
              <li key={c.id} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                <p className="font-medium leading-snug">
                  {c.name}
                  {c.relationship && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">· {c.relationship}</span>
                  )}
                </p>
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="text-xs text-primary hover:underline">
                    {c.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No emergency contacts on file. Ask your administrator to add them
            so they're available during a shift.
          </p>
        )}
      </Card>

      {/* PCSP summary */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Target className="h-3.5 w-3.5" /> Person-Centered Support Plan
        </h3>
        <ScrollArea className="h-56 rounded-lg border border-border bg-muted/20 p-3">
          {goals.length ? (
            <ul className="space-y-2 pr-2">
              {goals.map((g, i) => (
                <li
                  key={g}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  {g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No PCSP goals recorded yet — coordinate with your administrator
              to load this individual's plan.
            </p>
          )}
        </ScrollArea>
        {carePlanCustom.length > 0 && (
          <dl className="mt-3 space-y-1 border-t border-border pt-3">
            {carePlanCustom.map((f) => (
              <div key={f.id} className="text-xs">
                <dt className="inline font-medium text-muted-foreground">
                  {f.field_label}:
                </dt>{" "}
                <dd className="inline">{formatCustomValue(f)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {/* Behavioral triggers */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Behavioral
          Trigger Flags
        </h3>
        {(staffCare?.target_behaviors ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(staffCare?.target_behaviors ?? []).map((b) => (
              <li key={b.id} className="rounded-md border border-border bg-background px-3 py-2">
                <p className="text-sm font-medium leading-snug">{b.behavior_name}</p>
                {b.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{b.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No documented triggers on file. Triggers added by your supervisor
            will appear here so you can recognize them in real time.
          </p>
        )}
      </Card>

      {/* Interests / hobbies */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Heart className="h-3.5 w-3.5 text-rose-500" /> Interests & Hobbies
        </h3>
        {(staffCare?.preferred_activities ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {(staffCare?.preferred_activities ?? []).map((a) => (
              <Badge key={a} variant="secondary" className="font-normal">
                {a}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No interests or hobbies recorded yet.
          </p>
        )}
      </Card>

      {/* Client photo */}
      <div className="md:col-span-2">
        <ClientPhotoCard clientId={client.id} />
      </div>
    </div>
  );
}
