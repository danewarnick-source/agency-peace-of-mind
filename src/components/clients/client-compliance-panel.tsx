import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ClientIntakeChecklistCard } from "./client-intake-checklist-card";

interface ClientCompliancePanelProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  clientId: string;
  clientName: string;
}

/**
 * Slide-in sheet showing a client's intake checklist without navigating
 * away. Opened from: client list intake badge, after creating a
 * profile-only client.
 */
export function ClientCompliancePanel({
  open,
  onOpenChange,
  organizationId,
  clientId,
  clientName,
}: ClientCompliancePanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <SheetTitle>{clientName} — Intake Checklist</SheetTitle>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="mt-1 shrink-0 h-7 text-xs"
          >
            <a href={`/dashboard/clients/${clientId}?tab=overview`}>
              View full profile <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        </SheetHeader>
        <div className="mt-4 pb-8">
          <ClientIntakeChecklistCard
            organizationId={organizationId}
            clientId={clientId}
            clientName={clientName}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
