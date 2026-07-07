/**
 * Whiteboard placement notes — persisted freeform observations on client
 * and staff pills that inform planning and will be readable by NECTAR for
 * fit-scoring in a later pass.
 *
 * Full CRUD (working notes, NOT append-only audit trail).
 * Org-scoped RLS: members read, admin/manager write.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WhiteboardNote = {
  id: string;
  organization_id: string;
  subject_type: "client" | "staff";
  subject_id: string;
  note_text: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
};

const subjectType = z.enum(["client", "staff"]);

const listSchema = z.object({
  organization_id: z.string().uuid(),
  subject_type: subjectType,
  subject_id: z.string().uuid(),
});

const listBulkSchema = z.object({
  organization_id: z.string().uuid(),
  subjects: z
    .array(
      z.object({
        subject_type: subjectType,
        subject_id: z.string().uuid(),
      }),
    )
    .max(500),
});

const createSchema = z.object({
  organization_id: z.string().uuid(),
  subject_type: subjectType,
  subject_id: z.string().uuid(),
  note_text: z.string().trim().min(1).max(2000),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  note_text: z.string().trim().min(1).max(2000),
});

const deleteSchema = z.object({ id: z.string().uuid() });

/** List notes for a single subject (client or staff). */
export const listWhiteboardNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => listSchema.parse(d))
  .handler(async ({ data, context }): Promise<WhiteboardNote[]> => {
    const { supabase } = context;
    const q = await supabase
      .from("whiteboard_notes")
      .select("*")
      .eq("organization_id", data.organization_id)
      .eq("subject_type", data.subject_type)
      .eq("subject_id", data.subject_id)
      .order("created_at", { ascending: false });
    if (q.error) throw new Error(q.error.message);
    const notes = (q.data ?? []) as WhiteboardNote[];
    return await hydrateAuthorNames(supabase, notes);
  });

/** Bulk counts per subject for the board — for the notes-icon badge on each pill. */
export const getWhiteboardNoteCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ organization_id: z.string().uuid() }).parse(d))
  .handler(
    async ({ data, context }): Promise<
      Array<{ subject_type: "client" | "staff"; subject_id: string; count: number }>
    > => {
      const { supabase } = context;
      const q = await supabase
        .from("whiteboard_notes")
        .select("subject_type, subject_id")
        .eq("organization_id", data.organization_id);
      if (q.error) throw new Error(q.error.message);
      const map = new Map<string, { subject_type: "client" | "staff"; subject_id: string; count: number }>();
      for (const r of (q.data ?? []) as Array<{ subject_type: "client" | "staff"; subject_id: string }>) {
        const key = `${r.subject_type}:${r.subject_id}`;
        const existing = map.get(key);
        if (existing) existing.count += 1;
        else map.set(key, { subject_type: r.subject_type, subject_id: r.subject_id, count: 1 });
      }
      return Array.from(map.values());
    },
  );

export const createWhiteboardNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }): Promise<WhiteboardNote> => {
    const { supabase, userId } = context;
    const ins = await supabase
      .from("whiteboard_notes")
      .insert({
        organization_id: data.organization_id,
        subject_type: data.subject_type,
        subject_id: data.subject_id,
        note_text: data.note_text.trim(),
        created_by: userId,
      })
      .select("*")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    return ins.data as WhiteboardNote;
  });

export const updateWhiteboardNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateSchema.parse(d))
  .handler(async ({ data, context }): Promise<WhiteboardNote> => {
    const { supabase } = context;
    const upd = await supabase
      .from("whiteboard_notes")
      .update({ note_text: data.note_text.trim() })
      .eq("id", data.id)
      .select("*")
      .single();
    if (upd.error) throw new Error(upd.error.message);
    return upd.data as WhiteboardNote;
  });

export const deleteWhiteboardNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => deleteSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const del = await supabase.from("whiteboard_notes").delete().eq("id", data.id);
    if (del.error) throw new Error(del.error.message);
    return { ok: true };
  });

async function hydrateAuthorNames(
  supabase: NonNullable<Parameters<typeof requireSupabaseAuth>[0]> extends never ? any : any,
  notes: WhiteboardNote[],
): Promise<WhiteboardNote[]> {
  const ids = Array.from(new Set(notes.map((n) => n.created_by)));
  if (ids.length === 0) return notes;
  const p = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", ids);
  if (p.error) return notes;
  const nameById = new Map<string, string>();
  for (const r of (p.data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>) {
    const nm = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
    nameById.set(r.id, nm || "Unknown");
  }
  return notes.map((n) => ({ ...n, author_name: nameById.get(n.created_by) ?? null }));
}
