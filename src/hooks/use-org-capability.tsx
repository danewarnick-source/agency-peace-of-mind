/**
 * Client-side capability hook. Mirrors the exec-level `useCapability` in
 * `use-exec-capability.tsx` but resolves org-scoped capabilities via the
 * fail-closed DB resolver (see `public.has_capability` /
 * `public.effective_capabilities`).
 *
 * IMPORTANT: this hook is UI hygiene, not enforcement. Every server fn that
 * exposes sensitive data MUST gate with `requireCapability` server-side.
 */

import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import type { Capability } from "@/lib/capabilities";

/** Resolved effective capability set for the current user in the active org. */
export function useEffectiveCapabilities(): {
  capabilities: Set<Capability>;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const q = useQuery({
    enabled: !!user?.id && !!org?.organization_id,
    queryKey: ["effective-capabilities", org?.organization_id, user?.id],
    queryFn: async (): Promise<Set<Capability>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("effective_capabilities", {
        _user_id: user!.id,
        _org_id: org!.organization_id,
      });
      if (error) return new Set(); // fail closed
      const arr = Array.isArray(data) ? data : [];
      return new Set(arr as Capability[]);
    },
    staleTime: 60_000,
  });
  return {
    capabilities: q.data ?? new Set<Capability>(),
    isLoading: orgLoading || q.isLoading,
  };
}

/** Single-capability check. Fail closed: unknown / unset = false. */
export function useOrgCapability(cap: Capability): {
  allowed: boolean;
  isLoading: boolean;
} {
  const { capabilities, isLoading } = useEffectiveCapabilities();
  return { allowed: capabilities.has(cap), isLoading };
}

export function useAnyOrgCapability(caps: Capability[]): {
  allowed: boolean;
  isLoading: boolean;
} {
  const { capabilities, isLoading } = useEffectiveCapabilities();
  return { allowed: caps.some((c) => capabilities.has(c)), isLoading };
}

/**
 * Route-level gate — renders children only when the capability is present,
 * otherwise redirects to `/unauthorized`. Server-side gating on the data
 * fetched by those children is still required.
 */
export function RequireOrgCapability({
  cap,
  children,
  fallbackTo = "/unauthorized",
}: {
  cap: Capability;
  children: ReactNode;
  fallbackTo?: string;
}) {
  const { allowed, isLoading } = useOrgCapability(cap);
  const navigate = useNavigate();
  useEffect(() => {
    if (!isLoading && !allowed) navigate({ to: fallbackTo });
  }, [isLoading, allowed, navigate, fallbackTo]);
  if (isLoading || !allowed) {
    return <div className="text-sm text-muted-foreground">Verifying access…</div>;
  }
  return <>{children}</>;
}
