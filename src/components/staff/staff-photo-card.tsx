// StaffPhotoCard — mounts <PhotoUpload> against the staff-photos bucket and
// persists to profiles.photo_path + profiles.photo_updated_at. Also invalidates
// any staff header/pill queries so <PersonAvatar> refreshes.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PhotoUpload } from "@/components/person/photo-upload";

export function StaffPhotoCard({
  orgId,
  staffId,
  name,
  editing = false,
}: {
  orgId: string;
  staffId: string;
  name: string | null;
  editing?: boolean;
}) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["staff-photo-card", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("photo_path, photo_updated_at")
        .eq("id", staffId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const persist = useMutation({
    mutationFn: async (patch: { photo_path: string | null; photo_updated_at: string | null }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", staffId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-photo-card", staffId] });
      qc.invalidateQueries({ queryKey: ["staff-profile", orgId, staffId] });
    },
  });

  return (
    <PhotoUpload
      bucket="staff-photos"
      organizationId={orgId}
      subjectId={staffId}
      currentPath={(q.data?.photo_path ?? null) as string | null}
      personName={name}
      avatarClassName="h-28 w-28 text-2xl sm:h-36 sm:w-36 sm:text-3xl"
      className="flex flex-col items-start gap-3"
      readOnly={!editing}
      onUploaded={async (path) => {
        await persist.mutateAsync({
          photo_path: path,
          photo_updated_at: new Date().toISOString(),
        });
      }}
      onCleared={async () => {
        await persist.mutateAsync({ photo_path: null, photo_updated_at: null });
      }}
    />
  );
}
