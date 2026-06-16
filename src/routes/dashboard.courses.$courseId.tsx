import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  ListTree,
  Lock,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  AccordionLesson,
  AcknowledgementLesson,
  CalloutLesson,
  LessonTypeBadge,
  PdfLesson,
  QuizLesson,
  ScenarioLesson,
  TextLesson,
  VideoLesson,
  type LessonType,
  type QuizData,
} from "@/components/lesson-renderers";

export const Route = createFileRoute("/dashboard/courses/$courseId")({
  component: CoursePlayer,
});

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

type Module = {
  id: string;
  title: string;
  order_index: number;
  lessons: Lesson[];
};

function CoursePlayer() {
  const { courseId } = Route.useParams();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!courseId) console.error("[CoursePlayer] missing courseId");

  const { data: course, isLoading: courseLoading } = useQuery({
    enabled: !!courseId,
    queryKey: ["course", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, description, category, duration_minutes, cover_url, organization_id, certificate_validity_months")
        .eq("id", courseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: modules } = useQuery<Module[]>({
    enabled: !!courseId,
    queryKey: ["course-structure", courseId],
    queryFn: async () => {
      const { data: mods } = await supabase
        .from("course_modules")
        .select("id, title, order_index")
        .eq("course_id", courseId)
        .order("order_index");
      const ids = (mods ?? []).map((m) => m.id);
      if (!ids.length) return [];
      const { data: lessons } = await supabase
        .from("lessons")
        .select("id, module_id, title, content, order_index, duration_minutes, lesson_type, data, video_url, pdf_url, required")
        .in("module_id", ids)
        .order("order_index");
      return (mods ?? []).map((m) => ({
        ...m,
        lessons: ((lessons ?? []) as Lesson[]).filter((l) => l.module_id === m.id),
      }));
    },
  });

  const { data: assignment } = useQuery({
    enabled: !!user && !!courseId,
    queryKey: ["assignment", courseId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_assignments")
        .select("id, progress, status")
        .eq("course_id", courseId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: doneLessons } = useQuery<Set<string>>({
    enabled: !!user && !!courseId,
    queryKey: ["lesson-progress", courseId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_progress")
        .select("lesson_id, completed")
        .eq("user_id", user!.id);
      return new Set((data ?? []).filter((p) => p.completed).map((p) => p.lesson_id));
    },
  });

  const { data: quizAttempts } = useQuery<Map<string, { attempts: number; passed: boolean }>>({
    enabled: !!user && !!courseId,
    queryKey: ["quiz-attempts", courseId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_quiz_attempts")
        .select("lesson_id, passed")
        .eq("user_id", user!.id);
      const map = new Map<string, { attempts: number; passed: boolean }>();
      (data ?? []).forEach((r) => {
        const prev = map.get(r.lesson_id) ?? { attempts: 0, passed: false };
        map.set(r.lesson_id, {
          attempts: prev.attempts + 1,
          passed: prev.passed || r.passed,
        });
      });
      return map;
    },
  });

  const flatLessons = useMemo(() => (modules ?? []).flatMap((m) => m.lessons), [modules]);
  const total = flatLessons.length;
  const doneCount = flatLessons.filter((l) => doneLessons?.has(l.id)).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const totalMinutes = flatLessons.reduce((acc, l) => acc + (l.duration_minutes ?? 5), 0);
  const remainingMinutes = flatLessons
    .filter((l) => !doneLessons?.has(l.id))
    .reduce((acc, l) => acc + (l.duration_minutes ?? 5), 0);

  // Sequential gating: a lesson is locked if any previous required lesson isn't done
  function isLocked(lessonIdx: number): boolean {
    for (let i = 0; i < lessonIdx; i++) {
      const prev = flatLessons[i];
      if (!prev.required) continue;
      if (!doneLessons?.has(prev.id)) return true;
      // quiz lessons must be passed
      if (prev.lesson_type === "quiz" || prev.lesson_type === "knowledge_check") {
        const a = quizAttempts?.get(prev.id);
        if (!a?.passed) return true;
      }
    }
    return false;
  }

  // Resume: first unlocked, not-done lesson
  useEffect(() => {
    if (activeId || !flatLessons.length) return;
    const next = flatLessons.findIndex(
      (l, i) => !isLocked(i) && !doneLessons?.has(l.id),
    );
    setActiveId(flatLessons[next === -1 ? 0 : next].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatLessons.length, doneLessons?.size]);

  const activeIdx = flatLessons.findIndex((l) => l.id === activeId);
  const active = activeIdx >= 0 ? flatLessons[activeIdx] : null;
  const activeLocked = active ? isLocked(activeIdx) : false;
  const activeQuiz = active && (active.lesson_type === "quiz" || active.lesson_type === "knowledge_check")
    ? quizAttempts?.get(active.id)
    : undefined;

  const completeLesson = useMutation({
    mutationFn: async (lessonId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("lesson_progress").upsert(
        {
          lesson_id: lessonId,
          user_id: user.id,
          assignment_id: assignment?.id ?? null,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-progress"] });
      qc.invalidateQueries({ queryKey: ["assignment"] });
      qc.invalidateQueries({ queryKey: ["my-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordQuiz = useMutation({
    mutationFn: async (input: {
      lessonId: string;
      score: number;
      total: number;
      passed: boolean;
      answers: { question: number; choice: number }[];
    }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("lesson_quiz_attempts").insert({
        lesson_id: input.lessonId,
        user_id: user.id,
        score: input.score,
        total: input.total,
        passed: input.passed,
        answers: input.answers,
      });
      if (error) throw error;
      if (input.passed) {
        await supabase.from("lesson_progress").upsert(
          {
            lesson_id: input.lessonId,
            user_id: user.id,
            assignment_id: assignment?.id ?? null,
            completed: true,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "lesson_id,user_id" },
        );
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["quiz-attempts"] });
      qc.invalidateQueries({ queryKey: ["lesson-progress"] });
      qc.invalidateQueries({ queryKey: ["assignment"] });
      if (vars.passed) toast.success(`Passed with ${vars.score}%`);
      else toast.error(`Score ${vars.score}% — try again`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const goNext = () => {
    if (activeIdx < flatLessons.length - 1) {
      setActiveId(flatLessons[activeIdx + 1].id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goPrev = () => {
    if (activeIdx > 0) {
      setActiveId(flatLessons[activeIdx - 1].id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (courseLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!course) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Course not found or unavailable.
      </div>
    );
  }

  const SidebarBody = (
    <nav className="flex flex-col gap-1 p-2">
      {(modules ?? []).map((mod) => {
        const modDone = mod.lessons.every((l) => doneLessons?.has(l.id));
        return (
          <div key={mod.id} className="rounded-xl">
            <div className="flex items-center justify-between px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="truncate">{mod.title}</span>
              {modDone && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
            </div>
            <ul className="space-y-0.5">
              {mod.lessons.map((l) => {
                const idx = flatLessons.findIndex((x) => x.id === l.id);
                const locked = isLocked(idx);
                const done = doneLessons?.has(l.id);
                const isActive = active?.id === l.id;
                return (
                  <li key={l.id}>
                    <button
                      disabled={locked}
                      onClick={() => {
                        setActiveId(l.id);
                        setSheetOpen(false);
                      }}
                      className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        isActive ? "bg-accent/20" : "hover:bg-secondary/60"
                      } ${locked ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span className="mt-0.5">
                        {locked ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : done ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{l.title}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <LessonTypeBadge type={l.lesson_type} />
                          <span>{l.duration_minutes ?? 5}m</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {!modules?.length && (
        <p className="p-4 text-sm text-muted-foreground">No modules yet.</p>
      )}
    </nav>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/courses" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Library
        </Button>
        {can("edit_courses") && (
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/courses/$courseId/edit" params={{ courseId: course.id }}>
              <Pencil className="mr-1 h-4 w-4" /> Edit content
            </Link>
          </Button>
        )}
      </div>

      {/* Header */}
      <header className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-accent">{course.category ?? "Training"}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{course.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> ~{totalMinutes} min total
            </span>
            {remainingMinutes > 0 && pct > 0 && (
              <span>~{remainingMinutes} min remaining</span>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-1">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {doneCount} of {total} lessons complete · {pct}%
          </p>
        </div>
      </header>

      {/* Mobile module nav trigger */}
      <div className="lg:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              <ListTree className="mr-2 h-4 w-4" /> Browse modules
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] max-w-[calc(100vw-2rem)] p-0">
            <SheetHeader className="border-b border-border p-4">
              <SheetTitle>{course.title}</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto">{SidebarBody}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="hidden self-start rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] lg:block">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Course outline</h2>
            <p className="text-xs text-muted-foreground">{modules?.length ?? 0} modules · {total} lessons</p>
          </div>
          {SidebarBody}
        </aside>

        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] md:p-6">
          {!active ? (
            <p className="text-sm text-muted-foreground">No lesson selected.</p>
          ) : activeLocked ? (
            <div className="space-y-3 text-center">
              <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Complete the previous required lessons to unlock this one.
              </p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <LessonTypeBadge type={active.lesson_type} />
                  <span className="text-xs text-muted-foreground">
                    Lesson {activeIdx + 1} of {total}
                  </span>
                  {active.required && (
                    <Badge variant="outline" className="text-[10px]">Required</Badge>
                  )}
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">{active.title}</h2>
              </div>

              <LessonBody
                lesson={active}
                acknowledged={!!doneLessons?.has(active.id)}
                quizState={activeQuiz}
                onAcknowledge={() => completeLesson.mutate(active.id)}
                onScenarioResolve={() => completeLesson.mutate(active.id)}
                onQuizSubmit={(r) =>
                  recordQuiz.mutate({
                    lessonId: active.id,
                    score: r.score,
                    total: r.total,
                    passed: r.passed,
                    answers: r.answers,
                  })
                }
              />

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant="ghost" onClick={goPrev} disabled={activeIdx <= 0}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                </Button>
                <div className="flex gap-2">
                  {!doneLessons?.has(active.id) &&
                    !["quiz", "knowledge_check", "acknowledgement", "scenario"].includes(active.lesson_type) && (
                      <Button
                        onClick={() => completeLesson.mutate(active.id)}
                        disabled={completeLesson.isPending}
                        variant="outline"
                      >
                        Mark complete
                      </Button>
                    )}
                  <Button
                    onClick={goNext}
                    disabled={activeIdx >= flatLessons.length - 1}
                    className="bg-[image:var(--gradient-brand)] text-primary-foreground"
                  >
                    Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function LessonBody({
  lesson,
  acknowledged,
  quizState,
  onAcknowledge,
  onScenarioResolve,
  onQuizSubmit,
}: {
  lesson: Lesson;
  acknowledged: boolean;
  quizState?: { attempts: number; passed: boolean };
  onAcknowledge: () => void;
  onScenarioResolve: (correct: boolean) => void;
  onQuizSubmit: (r: {
    score: number;
    total: number;
    passed: boolean;
    answers: { question: number; choice: number }[];
  }) => void;
}) {
  const data = (lesson.data ?? {}) as Record<string, unknown>;
  const fallbackBody = lesson.content ?? "";

  switch (lesson.lesson_type) {
    case "video":
      return lesson.video_url ? (
        <VideoLesson url={lesson.video_url} data={{ caption: data.caption as string | undefined }} />
      ) : (
        <p className="text-sm text-muted-foreground">No video configured.</p>
      );
    case "pdf":
      return lesson.pdf_url ? (
        <PdfLesson url={lesson.pdf_url} />
      ) : (
        <p className="text-sm text-muted-foreground">No PDF uploaded.</p>
      );
    case "callout":
      return <CalloutLesson data={{ ...(data as object), body: (data.body as string) ?? fallbackBody } as Parameters<typeof CalloutLesson>[0]["data"]} />;
    case "accordion":
      return <AccordionLesson data={{ sections: (data.sections as { title: string; body: string }[]) ?? [] }} />;
    case "scenario":
      return (
        <ScenarioLesson
          data={{
            prompt: (data.prompt as string) ?? "",
            context: data.context as string | undefined,
            choices: (data.choices as { label: string; correct: boolean; feedback: string }[]) ?? [],
          }}
          onResolve={onScenarioResolve}
          resolved={acknowledged}
        />
      );
    case "acknowledgement":
      return (
        <AcknowledgementLesson
          data={{
            statement: (data.statement as string) ?? fallbackBody,
            signature_required: data.signature_required as boolean | undefined,
          }}
          onAcknowledge={onAcknowledge}
          acknowledged={acknowledged}
        />
      );
    case "quiz":
    case "knowledge_check":
      return (
        <QuizLesson
          data={data as unknown as QuizData}
          attempts={quizState?.attempts ?? 0}
          passed={quizState?.passed ?? false}
          onSubmit={onQuizSubmit}
        />
      );
    case "text":
    default:
      return <TextLesson data={{ body: (data.body as string) ?? fallbackBody }} />;
  }
}
