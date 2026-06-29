import { Badge } from "@/components/ui/badge";

export type AuthStatus = "active" | "expired" | "upcoming" | "end-needed";

export function getAuthStatus(
  start?: string | null,
  end?: string | null,
): AuthStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!end) return "end-needed";
  const e = new Date(end);
  if (isNaN(e.getTime())) return "end-needed";
  if (e < today) return "expired";
  if (start) {
    const s = new Date(start);
    if (!isNaN(s.getTime()) && s > today) return "upcoming";
  }
  return "active";
}

export function AuthStatusBadge({
  status,
  className = "",
}: {
  status: AuthStatus;
  className?: string;
}) {
  switch (status) {
    case "active":
      return (
        <Badge
          variant="outline"
          className={`border-emerald-500/50 bg-emerald-500/10 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 ${className}`}
        >
          Active
        </Badge>
      );
    case "expired":
      return (
        <Badge
          variant="outline"
          className={`border-red-500/50 bg-red-500/10 text-[10px] font-semibold text-red-700 dark:text-red-300 ${className}`}
        >
          Expired
        </Badge>
      );
    case "upcoming":
      return (
        <Badge
          variant="outline"
          className={`border-slate-400/50 bg-slate-400/10 text-[10px] font-semibold text-slate-700 dark:text-slate-300 ${className}`}
        >
          Upcoming
        </Badge>
      );
    case "end-needed":
      return (
        <Badge
          variant="outline"
          className={`border-amber-500/60 bg-amber-500/15 text-[10px] font-semibold text-amber-800 dark:text-amber-200 ${className}`}
        >
          End date needed
        </Badge>
      );
  }
}
