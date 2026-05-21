import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { LessonTypeBadge, type LessonType } from "@/components/lesson-renderers";

export const Route = createFileRoute("/dashboard/courses/$courseId/edit")({
  component: () => (
    <RequirePermission perm="edit_courses">
      <CourseEditor />
    </RequirePermission>
  ),
});

const LESSON_TYPES: LessonType[] = [
  "text",
  "video",
  "pdf",
  "callout",
  "accordion",
  "quiz",
  "knowledge_check",
  "scenario",
  "acknowledgement",
];

type Module = { id: string; title: string; order_index: number };
type Lesson = {
  id: string;
  module_id: string;
  title: string;
  content: string | null;
  order_index: number;
  duration_minutes: number | null;
  lesson_type: LessonType;
  data: Record<string, unknown>;
  video_url: string | null;
  pdf_url: string | null;
  required: boolean;
};

function CourseEditor() {
  const { courseId } = Route.useParams();
  const qc = useQueryClient();
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [creatingForModule, setCreatingForModule] = useState<string | null>(null);

  const { data: course } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, title").eq("id", courseId).maybeSingle();
      return data;
    },
  });

  const { data: modules } = useQuery<Module[]>({
    queryKey: ["edit-modules", courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_modules")
        .select("id, title, order_index")
        .eq("course_id", courseId)
        .order("order_index");
      return data ?? [];
    },
  });

  const { data: lessons } = useQuery<Lesson[]>({
    enabled: !!modules?.length,
    queryKey: ["edit-lessons", courseId, modules?.map((m) => m.id).join(",")],
    queryFn: async () => {
      const ids = (modules ?? []).map((m) => m.id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("lessons")
        .select("id, module_id, title, content, order_index, duration_minutes, lesson_type, data, video_url, pdf_url, required")
        .in("module_id", ids)
        .order("order_index");
      return (data ?? []) as Lesson[];
    },
  });

  const addModule = useMutation({
    mutationFn: async (title: string) => {
      const next = (modules?.length ?? 0);
      const { error } = await supabase
        .from("course_modules")
        .insert({ course_id: courseId, title, order_index: next });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["edit-modules", courseId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteModule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edit-modules", courseId] });
      qc.invalidateQueries({ queryKey: ["edit-lessons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertLesson = useMutation({
    mutationFn: async (input: Partial<Lesson> & { module_id: string }) => {
      const payload = {
        module_id: input.module_id,
        title: input.title ?? "Untitled lesson",
        content: input.content ?? null,
        order_index: input.order_index ?? 0,
        duration_minutes: input.duration_minutes ?? 5,
        lesson_type: input.lesson_type ?? "text",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: (input.data ?? {}) as any,
        video_url: input.video_url ?? null,
        pdf_url: input.pdf_url ?? null,
        required: input.required ?? true,
      };
      if (input.id) {
        const { error } = await supabase.from("lessons").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lessons").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edit-lessons"] });
      toast.success("Saved");
      setEditingLesson(null);
      setCreatingForModule(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLesson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lessons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["edit-lessons"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = async (lessonId: string, dir: -1 | 1, moduleId: string) => {
    const same = (lessons ?? []).filter((l) => l.module_id === moduleId);
    const idx = same.findIndex((l) => l.id === lessonId);
    const swap = idx + dir;
    if (swap < 0 || swap >= same.length) return;
    const a = same[idx];
    const b = same[swap];
    await Promise.all([
      supabase.from("lessons").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("lessons").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    qc.invalidateQueries({ queryKey: ["edit-lessons"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard/courses/$courseId" params={{ courseId }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to course
          </Link>
        </Button>
      </div>

      <header className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <p className="text-xs font-medium text-accent">Editing</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{course?.title ?? "Course"}</h1>
        <p className="text-sm text-muted-foreground">
          Build modules with rich, typed lessons. Reorder, upload PDFs/videos, and configure quizzes.
        </p>
      </header>

      <AddModuleCard onAdd={(t) => addModule.mutate(t)} pending={addModule.isPending} />

      <div className="space-y-4">
        {(modules ?? []).map((mod, mi) => {
          const modLessons = (lessons ?? []).filter((l) => l.module_id === mod.id);
          return (
            <section key={mod.id} className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
              <header className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Module {mi + 1}</p>
                  <h2 className="text-base font-semibold tracking-tight">{mod.title}</h2>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCreatingForModule(mod.id)}>
                    <Plus className="mr-1 h-4 w-4" /> Add lesson
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteModule.mutate(mod.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </header>
              {modLessons.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No lessons yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {modLessons.map((l, li) => (
                    <li key={l.id} className="flex items-center gap-3 p-4">
                      <div className="flex flex-col">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => reorder(l.id, -1, mod.id)}
                          disabled={li === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => reorder(l.id, 1, mod.id)}
                          disabled={li === modLessons.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <LessonTypeBadge type={l.lesson_type} />
                          {!l.required && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
                          <span className="text-xs text-muted-foreground">{l.duration_minutes ?? 5}m</span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">{l.title}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setEditingLesson(l)}>
                        Edit
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteLesson.mutate(l.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {(editingLesson || creatingForModule) && (
        <LessonEditorDialog
          lesson={editingLesson}
          moduleId={editingLesson?.module_id ?? creatingForModule!}
          nextOrder={
            (lessons ?? []).filter(
              (l) => l.module_id === (editingLesson?.module_id ?? creatingForModule),
            ).length
          }
          onClose={() => {
            setEditingLesson(null);
            setCreatingForModule(null);
          }}
          onSave={(payload) => upsertLesson.mutate(payload)}
        />
      )}
    </div>
  );
}

function AddModuleCard({ onAdd, pending }: { onAdd: (t: string) => void; pending: boolean }) {
  const [title, setTitle] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-border bg-card p-4">
      <div className="flex-1 min-w-[220px]">
        <Label className="text-xs">New module title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Privacy & HIPAA basics" />
      </div>
      <Button
        disabled={!title || pending}
        onClick={() => {
          onAdd(title);
          setTitle("");
        }}
      >
        <Plus className="mr-1 h-4 w-4" /> Add module
      </Button>
    </div>
  );
}

function LessonEditorDialog({
  lesson,
  moduleId,
  nextOrder,
  onClose,
  onSave,
}: {
  lesson: Lesson | null;
  moduleId: string;
  nextOrder: number;
  onClose: () => void;
  onSave: (l: Partial<Lesson> & { module_id: string }) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [type, setType] = useState<LessonType>(lesson?.lesson_type ?? "text");
  const [duration, setDuration] = useState<number>(lesson?.duration_minutes ?? 5);
  const [required, setRequired] = useState<boolean>(lesson?.required ?? true);
  const [body, setBody] = useState<string>((lesson?.data?.body as string) ?? lesson?.content ?? "");
  const [videoUrl, setVideoUrl] = useState<string>(lesson?.video_url ?? "");
  const [pdfUrl, setPdfUrl] = useState<string>(lesson?.pdf_url ?? "");
  const [jsonText, setJsonText] = useState<string>(
    lesson?.data ? JSON.stringify(lesson.data, null, 2) : defaultDataFor(type),
  );
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File, kind: "video" | "pdf") => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("training-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("training-assets").getPublicUrl(path);
      if (kind === "video") setVideoUrl(data.publicUrl);
      else setPdfUrl(data.publicUrl);
      toast.success("Uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    let data: Record<string, unknown> = {};
    if (type === "text") {
      data = { body };
    } else if (type === "callout" || type === "acknowledgement") {
      try {
        data = jsonText.trim() ? JSON.parse(jsonText) : {};
      } catch {
        toast.error("Invalid JSON");
        return;
      }
    } else if (["accordion", "quiz", "knowledge_check", "scenario"].includes(type)) {
      try {
        data = JSON.parse(jsonText);
      } catch {
        toast.error("Invalid JSON");
        return;
      }
    } else if (type === "video") {
      data = { caption: body };
    }
    onSave({
      id: lesson?.id,
      module_id: moduleId,
      title,
      content: body,
      order_index: lesson?.order_index ?? nextOrder,
      duration_minutes: duration,
      lesson_type: type,
      data,
      video_url: type === "video" ? videoUrl : lesson?.video_url ?? null,
      pdf_url: type === "pdf" ? pdfUrl : lesson?.pdf_url ?? null,
      required,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lesson ? "Edit lesson" : "New lesson"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_120px]">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  const newType = v as LessonType;
                  setType(newType);
                  setJsonText(defaultDataFor(newType));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 5)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={required} onCheckedChange={setRequired} />
            <span className="text-sm">Required to progress</span>
          </div>

          {type === "text" && (
            <div>
              <Label>Body (Markdown-lite: `## heading`, `- bullet`, paragraph breaks)</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
            </div>
          )}

          {type === "video" && (
            <div className="space-y-3">
              <div>
                <Label>Video URL (YouTube, Vimeo, or direct .mp4)</Label>
                <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
              </div>
              <UploadButton accept="video/*" onPick={(f) => handleUpload(f, "video")} disabled={uploading} />
              <div>
                <Label>Caption (optional)</Label>
                <Input value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
            </div>
          )}

          {type === "pdf" && (
            <div className="space-y-3">
              <div>
                <Label>PDF URL</Label>
                <Input value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} />
              </div>
              <UploadButton accept="application/pdf" onPick={(f) => handleUpload(f, "pdf")} disabled={uploading} />
            </div>
          )}

          {(type === "callout" ||
            type === "accordion" ||
            type === "quiz" ||
            type === "knowledge_check" ||
            type === "scenario" ||
            type === "acknowledgement") && (
            <div>
              <Label>
                Content (JSON) —{" "}
                <span className="text-muted-foreground">see schema hint below</span>
              </Label>
              <Textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={14}
                className="font-mono text-xs"
              />
              <SchemaHint type={type} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-[image:var(--gradient-brand)] text-primary-foreground">
            Save lesson
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadButton({
  accept,
  onPick,
  disabled,
}: {
  accept: string;
  onPick: (f: File) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex">
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <span
        className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-secondary ${
          disabled ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <Upload className="h-4 w-4" /> Upload file
      </span>
    </label>
  );
}

function SchemaHint({ type }: { type: LessonType }) {
  const hints: Partial<Record<LessonType, string>> = {
    callout: `{ "variant": "info" | "warning" | "critical" | "success", "title": "...", "body": "..." }`,
    accordion: `{ "sections": [ { "title": "...", "body": "..." } ] }`,
    quiz: `{ "passing_score": 80, "max_attempts": 3, "questions": [ { "q": "...", "choices": ["A","B","C"], "correct": 0, "explanation": "..." } ] }`,
    knowledge_check: `{ "passing_score": 100, "max_attempts": 5, "questions": [ { "q": "...", "choices": ["A","B"], "correct": 0 } ] }`,
    scenario: `{ "prompt": "...", "context": "...", "choices": [ { "label": "...", "correct": true, "feedback": "..." } ] }`,
    acknowledgement: `{ "statement": "I acknowledge...", "signature_required": true }`,
  };
  const h = hints[type];
  return h ? (
    <pre className="mt-2 overflow-x-auto rounded-md bg-secondary p-2 text-[10px] text-muted-foreground">{h}</pre>
  ) : null;
}

function defaultDataFor(type: LessonType): string {
  switch (type) {
    case "callout":
      return JSON.stringify(
        { variant: "info", title: "Important", body: "Compliance reminder body…" },
        null,
        2,
      );
    case "accordion":
      return JSON.stringify(
        { sections: [{ title: "Section A", body: "Details…" }] },
        null,
        2,
      );
    case "quiz":
      return JSON.stringify(
        {
          passing_score: 80,
          max_attempts: 3,
          questions: [
            {
              q: "Sample question?",
              choices: ["Option A", "Option B", "Option C"],
              correct: 0,
              explanation: "Why A is right.",
            },
          ],
        },
        null,
        2,
      );
    case "knowledge_check":
      return JSON.stringify(
        {
          passing_score: 100,
          max_attempts: 5,
          questions: [{ q: "Quick check?", choices: ["Yes", "No"], correct: 0 }],
        },
        null,
        2,
      );
    case "scenario":
      return JSON.stringify(
        {
          prompt: "A client requests…",
          context: "Background context for the scenario.",
          choices: [
            { label: "Do X", correct: true, feedback: "Correct because…" },
            { label: "Do Y", correct: false, feedback: "Not appropriate because…" },
          ],
        },
        null,
        2,
      );
    case "acknowledgement":
      return JSON.stringify(
        { statement: "I have read and agree to comply with the policy.", signature_required: true },
        null,
        2,
      );
    default:
      return "{}";
  }
}
