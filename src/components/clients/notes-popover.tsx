/**
 * Whiteboard placement-notes popover — attached to client and staff pills
 * on the planning board. Freeform observations that persist across sessions
 * and follow the subject regardless of where the pill is dragged.
 *
 * Full CRUD (add / edit / delete). Working notes, NOT append-only.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listWhiteboardNotes,
  createWhiteboardNote,
  updateWhiteboardNote,
  deleteWhiteboardNote,
  type WhiteboardNote,
} from "@/lib/whiteboard-notes.functions";

export type NotesPopoverProps = {
  organizationId: string;
  subjectType: "client" | "staff";
  subjectId: string;
  subjectLabel: string;
  canWrite: boolean;
  /** Optimistic count for the badge (from bulk-count query). Defaults to 0. */
  initialCount?: number;
};

export function NotesPopover({
  organizationId,
  subjectType,
  subjectId,
  subjectLabel,
  canWrite,
  initialCount = 0,
}: NotesPopoverProps) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const key = ["whiteboard-notes", organizationId, subjectType, subjectId] as const;

  const listFn = useServerFn(listWhiteboardNotes);
  const q = useQuery({
    queryKey: key,
    enabled: open,
    queryFn: () =>
      listFn({
        data: { organization_id: organizationId, subject_type: subjectType, subject_id: subjectId },
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["whiteboard-note-counts", organizationId] });
  };

  const displayCount = q.data?.length ?? initialCount;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="relative inline-flex items-center justify-center rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Placement notes"
          aria-label={`Placement notes for ${subjectLabel}`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {displayCount > 0 && (
            <span className="ml-0.5 text-[10px] font-semibold leading-none text-foreground">
              {displayCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        align="start"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Placement notes
            </div>
            <div className="truncate text-sm font-medium">{subjectLabel}</div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
            aria-label="Close notes"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <NotesList
          notes={q.data ?? []}
          loading={q.isLoading}
          canWrite={canWrite}
          onChanged={invalidate}
        />

        {canWrite && (
          <AddNoteForm
            organizationId={organizationId}
            subjectType={subjectType}
            subjectId={subjectId}
            onCreated={invalidate}
          />
        )}
        {!canWrite && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            View-only. Admins and managers can add notes.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotesList({
  notes,
  loading,
  canWrite,
  onChanged,
}: {
  notes: WhiteboardNote[];
  loading: boolean;
  canWrite: boolean;
  onChanged: () => void;
}) {
  if (loading) {
    return <p className="py-3 text-xs text-muted-foreground">Loading…</p>;
  }
  if (notes.length === 0) {
    return <p className="py-3 text-xs text-muted-foreground">No notes yet.</p>;
  }
  return (
    <ul className="mb-3 max-h-56 space-y-2 overflow-y-auto pr-1">
      {notes.map((n) => (
        <NoteRow key={n.id} note={n} canWrite={canWrite} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function NoteRow({
  note,
  canWrite,
  onChanged,
}: {
  note: WhiteboardNote;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.note_text);

  const updateFn = useServerFn(updateWhiteboardNote);
  const deleteFn = useServerFn(deleteWhiteboardNote);

  const upd = useMutation({
    mutationFn: (v: string) => updateFn({ data: { id: note.id, note_text: v } }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
      toast.success("Note updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id: note.id } }),
    onSuccess: () => {
      onChanged();
      toast.success("Note deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const when = new Date(note.updated_at || note.created_at).toLocaleDateString();

  return (
    <li className="rounded-md border border-border bg-muted/30 p-2 text-xs">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[64px] text-xs"
          />
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setEditing(false);
                setText(note.note_text);
              }}
              disabled={upd.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => upd.mutate(text)}
              disabled={upd.isPending || text.trim().length === 0}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words">{note.note_text}</p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {note.author_name ?? "Unknown"} · {when}
            </span>
            {canWrite && (
              <div className="flex gap-0.5">
                <button
                  type="button"
                  className="rounded p-1 hover:bg-muted hover:text-foreground"
                  onClick={() => setEditing(true)}
                  aria-label="Edit note"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 hover:bg-muted hover:text-destructive"
                  onClick={() => {
                    if (confirm("Delete this note?")) del.mutate();
                  }}
                  disabled={del.isPending}
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function AddNoteForm({
  organizationId,
  subjectType,
  subjectId,
  onCreated,
}: {
  organizationId: string;
  subjectType: "client" | "staff";
  subjectId: string;
  onCreated: () => void;
}) {
  const [text, setText] = useState("");
  const createFn = useServerFn(createWhiteboardNote);
  const create = useMutation({
    mutationFn: (v: string) =>
      createFn({
        data: {
          organization_id: organizationId,
          subject_type: subjectType,
          subject_id: subjectId,
          note_text: v,
        },
      }),
    onSuccess: () => {
      setText("");
      onCreated();
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2 border-t border-border pt-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a placement note (e.g. dislikes strong smells)…"
        className="min-h-[56px] text-xs"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => create.mutate(text)}
          disabled={create.isPending || text.trim().length === 0}
        >
          <MessageSquarePlus className="h-3 w-3" />
          Add note
        </Button>
      </div>
    </div>
  );
}
