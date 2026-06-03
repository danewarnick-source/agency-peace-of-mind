import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a client-photos storage path (e.g. "{orgId}/{clientId}/profile.jpg")
 * into a short-lived signed URL. The bucket is private; signed URLs are the
 * only way to render photos for authorized (same-org) users.
 *
 * Backwards-compat: if a legacy full URL slipped through (starts with http),
 * we just return it as-is so nothing crashes — RLS will still block fetch
 * from the storage side for unauthorized callers.
 */
function isFullUrl(v: string | null | undefined): v is string {
  return !!v && /^https?:\/\//i.test(v);
}

export function useClientPhotoSignedUrl(pathOrUrl: string | null | undefined) {
  return useQuery({
    queryKey: ["client-photo-signed-url", pathOrUrl ?? ""],
    enabled: !!pathOrUrl,
    staleTime: 45 * 60 * 1000, // refresh well before the 1h signed-url expiry
    queryFn: async () => {
      if (!pathOrUrl) return "";
      if (isFullUrl(pathOrUrl)) return pathOrUrl;
      const { data, error } = await supabase.storage
        .from("client-photos")
        .createSignedUrl(pathOrUrl, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? "";
    },
  });
}

interface ClientPhotoProps {
  path: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}

export function ClientPhoto({ path, alt, className, fallback }: ClientPhotoProps) {
  const { data: src } = useClientPhotoSignedUrl(path);
  if (!path || !src) return <>{fallback ?? null}</>;
  return <img src={src} alt={alt} className={className} />;
}
