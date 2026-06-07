import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type NoteRow = {
  id: string;
  note_type: "monthly_review" | "note";
  body: string;
  created_at: string;
  author_user_id: string;
};

export function NotesPanel({
  clientId,
  organizationId,
  canWrite,
}: {
  clientId: string;
  organizationId: string;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [type, setType] = useState<"monthly_review" | "note">("note");

  const { data: notes = [] } = useQuery<NoteRow[]>({
    queryKey: ["bc_review_notes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bc_review_notes")
        .select("id, note_type, body, created_at, author_user_id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!body.trim()) throw new Error("Note is empty.");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) throw new Error("Not signed in.");
      const { error } = await supabase.from("bc_review_notes").insert({
        organization_id: organizationId,
        client_id: clientId,
        note_type: type,
        body: body.trim(),
        author_user_id: u.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["bc_review_notes", clientId] });
      toast.success("Note added.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes &amp; monthly review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {canWrite && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="monthly_review">Monthly review</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add an objective, descriptive note. Cite BSP sections as needed."
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending} className="min-h-[44px]">
                {add.isPending ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border border-border p-2">
                <div className="mb-1 flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] font-mono uppercase">
                    {n.note_type === "monthly_review" ? "monthly review" : "note"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
