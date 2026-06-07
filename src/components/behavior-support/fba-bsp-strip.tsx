import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Eye } from "lucide-react";
import { toast } from "sonner";

type DocType = "FBA" | "BSP";
type DocRow = {
  id: string;
  doc_type: DocType;
  version: number;
  storage_path: string;
  uploaded_at: string;
  is_current: boolean;
};

export function FbaBspStrip({
  clientId,
  organizationId,
  canEdit,
}: {
  clientId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();

  const { data: docs = [] } = useQuery<DocRow[]>({
    queryKey: ["bc_documents", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bc_documents")
        .select("id, doc_type, version, storage_path, uploaded_at, is_current")
        .eq("client_id", clientId)
        .eq("is_current", true)
        .order("doc_type");
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  const fba = docs.find((d) => d.doc_type === "FBA");
  const bsp = docs.find((d) => d.doc_type === "BSP");

  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
        <DocSlot
          label="FBA"
          doc={fba}
          docType="FBA"
          canEdit={canEdit}
          clientId={clientId}
          organizationId={organizationId}
          onChanged={() => qc.invalidateQueries({ queryKey: ["bc_documents", clientId] })}
        />
        <DocSlot
          label="BSP"
          doc={bsp}
          docType="BSP"
          canEdit={canEdit}
          clientId={clientId}
          organizationId={organizationId}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["bc_documents", clientId] });
            qc.invalidateQueries({ queryKey: ["bc_behaviors", clientId] });
          }}
        />
      </CardContent>
    </Card>
  );
}

function DocSlot({
  label,
  doc,
  docType,
  canEdit,
  clientId,
  organizationId,
  onChanged,
}: {
  label: string;
  doc?: DocRow;
  docType: DocType;
  canEdit: boolean;
  clientId: string;
  organizationId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const open = useMutation({
    mutationFn: async () => {
      if (!doc) return;
      const { data, error } = await supabase.storage
        .from("bc-documents")
        .createSignedUrl(doc.storage_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not open document."),
  });

  async function handleUpload(file: File) {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Not signed in.");
      const ext = file.name.split(".").pop() ?? "pdf";
      const nextVersion = (doc?.version ?? 0) + 1;
      const path = `${organizationId}/${clientId}/${docType}/v${nextVersion}-${Date.now()}.${ext}`;

      const up = await supabase.storage.from("bc-documents").upload(path, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
      if (up.error) throw up.error;

      // Flip prior current to false
      if (doc) {
        const upd = await supabase
          .from("bc_documents")
          .update({ is_current: false })
          .eq("client_id", clientId)
          .eq("doc_type", docType)
          .eq("is_current", true);
        if (upd.error) throw upd.error;
      }

      const ins = await supabase.from("bc_documents").insert({
        organization_id: organizationId,
        client_id: clientId,
        doc_type: docType,
        storage_path: path,
        version: nextVersion,
        is_current: true,
        uploaded_by_user_id: userId,
      });
      if (ins.error) throw ins.error;

      // If BSP replaced, return all published/approved behaviors to draft for re-review
      if (docType === "BSP") {
        await supabase
          .from("bc_behaviors")
          .update({ status: "draft", approved_at: null, approved_by_user_id: null, published_at: null, published_by_user_id: null })
          .eq("client_id", clientId)
          .in("status", ["approved", "published"]);
      }

      toast.success(`${docType} v${nextVersion} uploaded.`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-[color:var(--teal-700,#137182)]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          {doc ? (
            <p className="text-[11px] text-muted-foreground">
              v{doc.version} · {new Date(doc.uploaded_at).toLocaleDateString()}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Not uploaded</p>
          )}
        </div>
        {doc && (
          <Badge variant="outline" className="ml-1 font-mono text-[10px]">
            current
          </Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {doc && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => open.mutate()}
            disabled={open.isPending}
          >
            <Eye className="mr-1 h-3.5 w-3.5" /> Open
          </Button>
        )}
        {canEdit && (
          <label className="inline-flex">
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="default" asChild className="min-h-[44px] cursor-pointer">
              <span>
                <Upload className="mr-1 h-3.5 w-3.5" />
                {busy ? "Uploading…" : doc ? "Replace" : "Upload"}
              </span>
            </Button>
          </label>
        )}
      </div>
    </div>
  );
}
