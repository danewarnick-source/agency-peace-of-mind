import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Shared avatar for clients (bucket: client-photos) and staff (bucket:
 * staff-photos). Both buckets are private; we resolve a short-lived signed
 * URL. When no photo is on file, renders initials in a soft primary chip.
 */
type Bucket = "client-photos" | "staff-photos";

export function useSignedPhoto(bucket: Bucket, path: string | null | undefined) {
  return useQuery({
    enabled: !!path,
    queryKey: ["signed-photo", bucket, path ?? ""],
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      if (!path) return "";
      if (/^https?:\/\//i.test(path)) return path;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? "";
    },
  });
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function PersonAvatar({
  bucket,
  path,
  name,
  className,
}: {
  bucket: Bucket;
  path: string | null | undefined;
  name: string | null | undefined;
  className?: string;
}) {
  const { data: src } = useSignedPhoto(bucket, path);
  if (path && src) {
    return (
      <img
        src={src}
        alt={name ? `${name} photo` : "Person photo"}
        className={cn(
          "h-10 w-10 rounded-full object-cover border-2 border-border",
          className,
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary border-2 border-border",
        className,
      )}
      aria-label={name ? `${name} initials` : "No photo on file"}
    >
      {initials(name)}
    </span>
  );
}
