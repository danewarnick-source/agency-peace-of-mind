import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useIsHiveExecutive } from "@/hooks/use-hive-executive";
import {
  EXECUTIVE_ROLE_CAPABILITIES,
  type ExecCapability,
} from "@/lib/exec-capabilities";

export function useExecCapabilities(): {
  capabilities: ExecCapability[];
  isLoading: boolean;
} {
  const { isExecutive, isLoading } = useIsHiveExecutive();
  return {
    capabilities: isExecutive ? EXECUTIVE_ROLE_CAPABILITIES.executive : [],
    isLoading,
  };
}

export function useCapability(cap: ExecCapability): {
  allowed: boolean;
  isLoading: boolean;
} {
  const { capabilities, isLoading } = useExecCapabilities();
  return { allowed: capabilities.includes(cap), isLoading };
}

export function useAnyCapability(caps: ExecCapability[]): {
  allowed: boolean;
  isLoading: boolean;
} {
  const { capabilities, isLoading } = useExecCapabilities();
  return {
    allowed: caps.some((c) => capabilities.includes(c)),
    isLoading,
  };
}

export function RequireCapability({
  cap,
  children,
}: {
  cap: ExecCapability;
  children: ReactNode;
}) {
  const { allowed, isLoading } = useCapability(cap);
  const navigate = useNavigate();
  useEffect(() => {
    if (!isLoading && !allowed) navigate({ to: "/unauthorized" });
  }, [isLoading, allowed, navigate]);
  if (isLoading || !allowed) {
    return <div className="text-sm text-muted-foreground">Verifying access…</div>;
  }
  return <>{children}</>;
}
