import { NectarHeader, NectarButton } from "@/components/nectar/nectar-brand";
import { useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";

export function FirstRunNudge({ companyName }: { companyName: string }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <NectarHeader
        surface="navy"
        markSize="lg"
        eyebrow="Welcome"
        title={`Let's get ${companyName} humming.`}
        description="Skip the bleak zeros — invite your first staff member and NECTAR will start tracking your team's progress."
        right={
          <NectarButton
            variant="amber"
            icon={<UserPlus className="h-4 w-4" />}
            onClick={() => navigate({ to: "/dashboard/employees" })}
          >
            Invite your first staff
          </NectarButton>
        }
      />
    </div>
  );
}
