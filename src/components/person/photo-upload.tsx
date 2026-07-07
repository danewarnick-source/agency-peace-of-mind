import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, Trash2 } from "lucide-react";
import { PersonAvatar } from "./person-avatar";

/**
 * Uploads a photo into a private org-scoped bucket at
 * `{organizationId}/{subjectId}/photo-{timestamp}.{ext}` and calls back
 * with the storage path so the caller can persist it on its own record
 * (clients.client_photo_url / profiles.photo_path / organization_branding.logo_path).
 *
 * The bucket's RLS on storage.objects gates who can write; if the write
 * fails, we surface the DB error verbatim so admins see it.
 */
type Bucket = "client-photos" | "staff-photos" | "org-branding";

export function PhotoUpload({
  bucket,
  organizationId,
  subjectId,
  currentPath,
  personName,
  onUploaded,
  onCleared,
  label = "Upload photo",
}: {
  bucket: Bucket;
  organizationId: string;
  subjectId: string;
  currentPath: string | null | undefined;
  personName?: string | null;
  onUploaded: (path: string) => Promise<void> | void;
  onCleared?: () => Promise<void> | void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const displayBucket: "client-photos" | "staff-photos" =
    bucket === "staff-photos" ? "staff-photos" : "client-photos";

  const upload = async (file: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Photo must be under 8 MB");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${organizationId}/${subjectId}/photo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (error) throw error;
      await onUploaded(path);
      toast.success("Photo saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      {bucket === "org-branding" ? null : (
        <PersonAvatar
          bucket={displayBucket}
          path={currentPath ?? null}
          name={personName ?? null}
          className="h-16 w-16"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {busy ? "Uploading…" : label}
        </Button>
        {currentPath && onCleared ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await supabase.storage.from(bucket).remove([currentPath]);
                await onCleared();
                toast.success("Photo removed");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Remove failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
