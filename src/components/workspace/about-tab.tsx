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

export function AboutTab({ client }: { client: CaseloadClient }) {
  const goals = client.pcsp_goals ?? [];
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
            {client.medicaid_id && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Medicaid ID:{" "}
                <span className="font-mono">{client.medicaid_id}</span>
              </p>
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

