import { useNavigate } from "@tanstack/react-router";
import { Users, GraduationCap, Building2 } from "lucide-react";
import { NectarButton } from "@/components/nectar/nectar-brand";

export function QuickActionsCard({
  emphasized = false,
  onInvite,
}: {
  emphasized?: boolean;
  onInvite?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <section
      className={`rounded-2xl border bg-card/80 p-5 shadow-card backdrop-blur ${
        emphasized ? "border-[#f4a93a]/50 ring-1 ring-[#f4a93a]/20" : "border-border"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight">Quick actions</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        The fastest way to move your team forward.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <NectarButton
          variant="amber"
          icon={<Users className="h-4 w-4" />}
          onClick={() => (onInvite ? onInvite() : navigate({ to: "/dashboard/employees" }))}
        >
          Invite staff
        </NectarButton>
        <NectarButton
          variant="ghost"
          icon={<GraduationCap className="h-4 w-4" />}
          onClick={() => navigate({ to: "/dashboard/courses" })}
        >
          Assign a module
        </NectarButton>
        <NectarButton
          variant="ghost"
          icon={<Building2 className="h-4 w-4" />}
          onClick={() => navigate({ to: "/dashboard/teams" })}
        >
          Create a group
        </NectarButton>
      </div>
    </section>
  );
}
