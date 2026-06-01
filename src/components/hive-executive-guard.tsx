import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useIsHiveExecutive } from "@/hooks/use-hive-executive";

export function RequireHiveExecutive({ children }: { children: ReactNode }) {
  const { isExecutive, isLoading } = useIsHiveExecutive();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isLoading && !isExecutive) navigate({ to: "/unauthorized" });
  }, [isLoading, isExecutive, navigate]);
  if (isLoading || !isExecutive) {
    return <div className="text-sm text-muted-foreground">Verifying HIVE Executive access…</div>;
  }
  return <>{children}</>;
}
