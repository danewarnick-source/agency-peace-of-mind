import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Renders the organization logo from the private `org-branding` bucket.
 * If no logo is uploaded, falls back to the org name in a large title
 * font — never a broken image.
 */
export function useOrgBranding(organizationId: string | null | undefined) {
  return useQuery({
    enabled: !!organizationId,
    queryKey: ["org-branding", organizationId ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_branding")
        .select("logo_path, org_address, org_phone, logo_uploaded_at")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

function useSignedLogoUrl(path: string | null | undefined) {
  return useQuery({
    enabled: !!path,
    queryKey: ["org-branding-logo-signed", path ?? ""],
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("org-branding")
        .createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? "";
    },
  });
}

export function OrgLogo({
  organizationId,
  orgName,
  className,
  titleClassName,
}: {
  organizationId: string | null | undefined;
  orgName: string | null | undefined;
  className?: string;
  titleClassName?: string;
}) {
  const { data: branding } = useOrgBranding(organizationId);
  const { data: signed } = useSignedLogoUrl(branding?.logo_path);
  if (branding?.logo_path && signed) {
    return (
      <img
        src={signed}
        alt={orgName ? `${orgName} logo` : "Organization logo"}
        className={cn("h-14 w-auto object-contain", className)}
      />
    );
  }
  // Fallback: organization name as large title text.
  return (
    <div
      className={cn(
        "text-2xl font-bold tracking-tight leading-none text-foreground",
        titleClassName,
      )}
    >
      {orgName?.trim() || "Organization"}
    </div>
  );
}
