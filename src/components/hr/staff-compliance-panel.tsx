import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StaffHrChecklistCard } from "./staff-hr-checklist-card";

interface StaffCompliancePanelProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  staffId: string;
  staffName: string;
  /** When true, shows the "complete before first shift" header */
  isNewEmployee?: boolean;
}

/**
 * Slide-in sheet showing a staff member's compliance checklist without
 * navigating away. Opened from: employee list badge, admin home "Staff
 * needing attention" list, after creating a new employee.
 */
export function StaffCompliancePanel({
  open,
  onOpenChange,
  organizationId,
  staffId,
  staffName,
  isNewEmployee = false,
}: StaffCompliancePanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <div>
            <SheetTitle>
              {isNewEmployee
                ? "Complete this staff record — required before first shift"
                : `${staffName} — Compliance Checklist`}
            </SheetTitle>
            {isNewEmployee && (
              <SheetDescription className="mt-1">
                {staffName}
              </SheetDescription>
            )}
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="mt-1 shrink-0 h-7 text-xs"
          >
            <a href={`/dashboard/employees/${staffId}?tab=checklist`}>
              View full profile <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        </SheetHeader>
        <div className="mt-4 pb-8">
          <StaffHrChecklistCard
            organizationId={organizationId}
            staffId={staffId}
            view="checklist"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
