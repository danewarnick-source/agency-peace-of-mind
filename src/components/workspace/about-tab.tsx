import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Heart,
  MapPin,
  Phone,
  Target,
  User,
} from "lucide-react";
import type { CaseloadClient } from "@/hooks/use-caseload";
import { FaceSheetInfoCard } from "@/components/clients/face-sheet-info-card";
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

export function AboutTab({ client }: { client: CaseloadClient }) {
  // Route ALL client-info reads through the shared visibility layer so
  // section+field toggles set on the admin side automatically hide data
  // from staff. Falls back to the caseload row while data loads.
  const care = useClientCareData(client.id);
  const staffCare = care.data?.visibility.staffCare;
  const sections = care.data?.visibility.sections;

  const identitySectionOn = sections?.identity ?? true;
  const carePlanSectionOn = sections?.care_plan ?? true;

  const goals =
    carePlanSectionOn
      ? (staffCare?.goals ?? []).map((g) => g.goal).filter(Boolean)
      : [];

  const medicaidId = identitySectionOn
    ? staffCare?.identity.medicaid_id ?? client.medicaid_id
    : null;

  // Custom fields already filtered by section toggle on the server.
  const customFields = staffCare?.custom_fields ?? [];
  const identityCustom = customFields.filter((f) => f.section === "identity");
  const carePlanCustom = customFields.filter((f) => f.section === "care_plan");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Identity card */}
      <Card className="p-5 md:col-span-2">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
          <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <User className="h-10 w-10" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Active Individual
            </p>
            <h2 className="mt-0.5 text-2xl font-semibold tracking-tight">
              {client.first_name} {client.last_name}
            </h2>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {client.physical_address ?? "Address on file with administrator"}
            </p>
            {medicaidId && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Medicaid ID:{" "}
                <span className="font-mono">{medicaidId}</span>
              </p>
            )}
            {identityCustom.length > 0 && (
              <dl className="mt-2 space-y-0.5">
                {identityCustom.map((f) => (
                  <div key={f.id} className="text-xs text-muted-foreground">
                    <dt className="inline font-medium">{f.field_label}:</dt>{" "}
                    <dd className="inline">{formatCustomValue(f)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
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
        <p className="text-sm text-muted-foreground">
          No documented triggers on file. Triggers added by your supervisor
          will appear here so you can recognize them in real time.
        </p>
      </Card>

      {/* Emergency contacts */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Phone className="h-3.5 w-3.5" /> Emergency Contacts
        </h3>
        <p className="text-sm text-muted-foreground">
          Emergency phone numbers are kept current by an administrator. If you
          need them during a shift, contact your on-call supervisor.
        </p>
      </Card>

      {/* Interests / hobbies */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Heart className="h-3.5 w-3.5 text-rose-500" /> Interests & Hobbies
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="font-normal">
            Personal preferences will populate from intake forms
          </Badge>
        </div>
      </Card>

      {/* Face Sheet Info — backs every field on the printable Client Face Sheet */}
      <div className="md:col-span-2">
        <ClientPhotoCard clientId={client.id} />
      </div>
      <div className="md:col-span-2">
        <FaceSheetInfoCard clientId={client.id} />
      </div>
    </div>
  );
}

