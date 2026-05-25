import { useImpersonation } from "@/hooks/use-impersonation";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export function ImpersonationBanner() {
  const { session, isImpersonating, stop } = useImpersonation();
  const navigate = useNavigate();

  if (!isImpersonating || !session) return null;

  const exit = () => {
    stop();
    toast.success("Restored Super-Admin credentials");
    navigate({ to: "/dashboard/super-admin" });
  };

  return (
    <div
      className="sticky top-0 z-50 flex h-10 w-full items-center justify-between gap-3 bg-[oklch(0.55_0.22_25)] px-4 text-white shadow-md"
      role="alert"
    >
      <div className="flex-1 text-center text-sm font-medium">
        ⚠️ System Alert: You are currently viewing the platform as{" "}
        <span className="font-bold">{session.current_user_name}</span>
        {session.tenant_name && (
          <>
            {" "}(<span className="font-bold">{session.tenant_name}</span>)
          </>
        )}
        . All modifications are monitored and tracked under Super-Admin Auditing rules.
      </div>
      <button
        onClick={exit}
        className="shrink-0 rounded-md bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-white/25"
      >
        🛑 Exit Impersonation Mode
      </button>
    </div>
  );
}
