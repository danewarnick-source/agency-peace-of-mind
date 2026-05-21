import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Plus, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/programs-admin")({
  component: () => (
    <RequirePermission perm="manage_programs">
      <ProgramsAdminPage />
    </RequirePermission>
  ),
});

function ProgramsAdminPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: programs } = useQuery({
    queryKey: ["admin-programs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_programs")
        .select("id, name, slug, description, category, annual_renewal, validity_months, estimated_minutes, is_global, organization_id, is_published")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const selected = useMemo(
    () => programs?.find((p) => p.id === selectedId) ?? programs?.[0] ?? null,
    [programs, selectedId],
  );

  const { data: programCourses } = useQuery({
    enabled: !!selected?.id,
    queryKey: ["program-courses", selected?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("program_courses")
        .select("id, course_id, order_index, required, unlock_after")
        .eq("program_id", selected!.id)
        .order("order_index", { ascending: true });
      return data ?? [];
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["all-courses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, title, category, is_published, is_global, organization_id")
        .order("title", { ascending: true });
      return data ?? [];
    },
  });

  const courseById = useMemo(
    () => new Map((courses ?? []).map((c) => [c.id, c])),
    [courses],
  );

  const linkedIds = new Set((programCourses ?? []).map((pc) => pc.course_id));
  const availableCourses = (courses ?? []).filter((c) => !linkedIds.has(c.id));

  const createProgram = useMutation({
    mutationFn: async (input: {
      name: string;
      description: string;
      category: string;
      validity_months: number;
      annual_renewal: boolean;
    }) => {
      if (!user || !org) throw new Error("Missing org context");
      const baseSlug =
        input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
        "program";
      // crypto.randomUUID guarantees slug uniqueness even on collisions
      const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
      const { data, error } = await supabase
        .from("training_programs")
        .insert({
          name: input.name,
          slug,
          description: input.description,
          category: input.category || null,
          validity_months: input.validity_months,
          annual_renewal: input.annual_renewal,
          organization_id: org.organization_id,
          created_by: user.id,
          is_published: true,
        })
        .select("id, slug, name")
        .single();
      if (error) {
        console.error("[createProgram] insert failed", error);
        throw error;
      }
      if (!data?.id) throw new Error("Program created but no ID returned");
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Program created");
      setSelectedId(id);
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-programs"] });
      qc.invalidateQueries({ queryKey: ["training-programs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCourse = useMutation({
    mutationFn: async (courseId: string) => {
      if (!selected) throw new Error("No program");
      const nextOrder = (programCourses?.length ?? 0);
      const { error } = await supabase.from("program_courses").insert({
        program_id: selected.id,
        course_id: courseId,
        order_index: nextOrder,
        required: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["program-courses", selected?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRow = useMutation({
    mutationFn: async (input: {
      id: string;
      patch: { required?: boolean; unlock_after?: string | null; order_index?: number };
    }) => {
      const { error } = await supabase
        .from("program_courses")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["program-courses", selected?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("program_courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["program-courses", selected?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = async (index: number, dir: -1 | 1) => {
    if (!programCourses) return;
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= programCourses.length) return;
    const a = programCourses[index];
    const b = programCourses[swapIdx];
    await Promise.all([
      supabase.from("program_courses").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("program_courses").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    qc.invalidateQueries({ queryKey: ["program-courses", selected?.id] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-base font-semibold">Manage Programs</h2>
          <p className="text-sm text-muted-foreground">
            Build multi-module training programs by linking courses, setting order, and gating modules.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[image:var(--gradient-brand)] text-primary-foreground">
              <Plus className="h-4 w-4" /> New program
            </Button>
          </DialogTrigger>
          <CreateProgramDialog onSubmit={(v) => createProgram.mutate(v)} pending={createProgram.isPending} />
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
          {!programs?.length ? (
            <p className="p-3 text-sm text-muted-foreground">No programs yet.</p>
          ) : (
            programs.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                  selected?.id === p.id ? "bg-secondary" : "hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Layers className="h-4 w-4 text-accent" />
                  <span className="truncate">{p.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  {p.is_global && <Badge variant="outline" className="text-[10px]">Global</Badge>}
                  {p.annual_renewal && <Badge variant="outline" className="text-[10px]">Annual</Badge>}
                  <span>{p.category ?? "Program"}</span>
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select or create a program to manage its courses.</p>
          ) : (
            <>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">{selected.name}</h3>
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-3">
                <div className="flex-1 min-w-[220px]">
                  <Label className="text-xs">Add course</Label>
                  <Select
                    onValueChange={(v) => addCourse.mutate(v)}
                    disabled={addCourse.isPending || !availableCourses.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={availableCourses.length ? "Pick a course…" : "All courses already linked"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCourses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!programCourses?.length ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No courses linked yet. Add one above.
                </div>
              ) : (
                <div className="space-y-2">
                  {programCourses.map((row, idx) => {
                    const course = courseById.get(row.course_id);
                    return (
                      <div
                        key={row.id}
                        className="grid items-center gap-3 rounded-xl border border-border bg-background p-3 md:grid-cols-[auto_1fr_180px_auto_auto]"
                      >
                        <div className="flex flex-col gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => reorder(idx, -1)} disabled={idx === 0}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => reorder(idx, 1)} disabled={idx === programCourses.length - 1}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {idx + 1}. {course?.title ?? "Unknown course"}
                          </p>
                          {course?.category && (
                            <p className="text-xs text-muted-foreground">{course.category}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Unlock after</Label>
                          <Select
                            value={row.unlock_after ?? "none"}
                            onValueChange={(v) =>
                              updateRow.mutate({
                                id: row.id,
                                patch: { unlock_after: v === "none" ? null : v },
                              })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No prerequisite</SelectItem>
                              {programCourses
                                .filter((other) => other.id !== row.id)
                                .map((other) => (
                                  <SelectItem key={other.id} value={other.course_id}>
                                    {courseById.get(other.course_id)?.title ?? "—"}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.required}
                            onCheckedChange={(v) =>
                              updateRow.mutate({ id: row.id, patch: { required: v } })
                            }
                          />
                          <span className="text-xs text-muted-foreground">Required</span>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => removeRow.mutate(row.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function CreateProgramDialog({
  onSubmit,
  pending,
}: {
  onSubmit: (v: {
    name: string;
    description: string;
    category: string;
    validity_months: number;
    annual_renewal: boolean;
  }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [validity, setValidity] = useState(12);
  const [annual, setAnnual] = useState(false);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New training program</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="DSPD Core Compliance" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Compliance" />
          </div>
          <div>
            <Label>Validity (months)</Label>
            <Input
              type="number"
              value={validity}
              onChange={(e) => setValidity(Number(e.target.value) || 12)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={annual} onCheckedChange={setAnnual} />
          <span className="text-sm">Annual renewal required</span>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!name || pending}
          onClick={() => onSubmit({ name, description, category, validity_months: validity, annual_renewal: annual })}
          className="bg-[image:var(--gradient-brand)] text-primary-foreground"
        >
          Create program
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
