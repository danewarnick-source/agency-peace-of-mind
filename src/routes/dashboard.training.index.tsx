import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Award, UserPlus, BookOpen, GraduationCap, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { getMyClientTrainingStatuses } from "@/lib/client-specific-training.functions";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";

export const Route = createFileRoute("/dashboard/training/")({ component: CourseLibrary });

type Module = {
  id: string;
  title: string;
  description: string | null;
  sequence_order: number;
};

function CourseLibrary() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const isAdmin = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";
  const [selectedUser, setSelectedUser] = useState<string>("");

  const getMyTrainingsFn = useServerFn(getMyClientTrainingStatuses);

  const { data: myTrainings } = useQuery({
    queryKey: ["my-client-training-statuses"],
    queryFn: () => getMyTrainingsFn({ data: undefined }),
    staleTime: 60_000,
  });

  const { data: modules, isLoading } = useQuery({
    queryKey: ["training-modules"],
    queryFn: async (): Promise<Module[]> => {
      const { data, error } = await supabase
        .from("training_modules")
        .select("id, title, description, sequence_order")
        .order("sequence_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Module[];
    },
  });

  const { data: members } = useQuery({
    enabled: !!org && isAdmin,
    queryKey: ["org-members-for-assign", org?.organization_id],
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", org!.organization_id)
        .eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase
        .from("org_member_directory")
        .select("id, full_name, email, username")
        .in("id", ids);
      return (profs ?? [])
        .filter((p): p is typeof p & { id: string } => !!p.id)
        .map((p) => ({
          id: p.id,
          label: p.full_name || p.email || p.username || "—",
        }));
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!modules?.length) throw new Error("Modules not loaded");
      // Insert a progress row per module if it doesn't exist (best-effort upsert by user/module).
      const rows = modules.map((m) => ({
        user_id: userId,
        module_id: m.id,
        is_completed: false,
      }));
      // Check existing
      const { data: existing } = await supabase
        .from("user_training_progress")
        .select("module_id")
        .eq("user_id", userId);
      const existingSet = new Set((existing ?? []).map((r) => r.module_id));
      const toInsert = rows.filter((r) => !existingSet.has(r.module_id));
      if (!toInsert.length) return { inserted: 0 };
      const { error } = await supabase.from("user_training_progress").insert(toInsert);
      if (error) throw error;
      return { inserted: toInsert.length };
    },
    onSuccess: (res) => {
      toast.success(
        res.inserted
          ? `Compliance track assigned (${res.inserted} module${res.inserted === 1 ? "" : "s"})`
          : "Track already assigned to this employee",
      );
      qc.invalidateQueries({ queryKey: ["my-training-progress"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <StaffPageHeader
        eyebrow="Utah DSPD · Provider Compliance"
        eyebrowIcon={GraduationCap}
        title="Course Library"
        subtitle="The six required compliance modules for every direct-support professional."
      />


      {/* Client-Specific Training panel */}
      {(myTrainings?.items ?? []).length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold">Client-Specific Training</h3>
          </div>
          <div className="space-y-3">
            {(myTrainings?.items ?? []).map((item) => (
              <div key={item.clientId} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="font-medium text-sm mb-2">{item.clientName}</div>
                <div className="flex flex-wrap gap-2">
                  {item.trainings.map((t) => {
                    if (t.setupStatus === "not_setup") {
                      return (
                        <span key={t.type} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <AlertTriangle className="h-3 w-3" />{t.label}: not set up
                        </span>
                      );
                    }
                    if (t.setupStatus === "draft") {
                      return (
                        <span key={t.type} className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs">
                          <Clock className="h-3 w-3" />{t.label}: draft
                        </span>
                      );
                    }
                    if (t.completionStatus === "completed") {
                      return (
                        <span key={t.type} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs">
                          <CheckCircle2 className="h-3 w-3" />{t.label}: done {t.completedAt ? new Date(t.completedAt).toLocaleDateString() : ""}
                        </span>
                      );
                    }
                    return (
                      <Link
                        key={t.type}
                        to="/dashboard/client-training/$clientId"
                        params={{ clientId: item.clientId }}
                        search={{ trainingType: t.type as "person_specific" | "support_strategies" }}
                        className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2 py-0.5 text-xs hover:bg-accent/25 transition"
                      >
                        <PlayCircle className="h-3 w-3" />{t.label}: start
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold">Assign Training Track</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Initialize the 6-module compliance track for an employee.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="min-w-[260px] flex-1">
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an employee…" />
                </SelectTrigger>
                <SelectContent>
                  {members?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => selectedUser && assignMutation.mutate(selectedUser)}
              disabled={!selectedUser || assignMutation.isPending}
              className="bg-[image:var(--gradient-brand)] text-primary-foreground"
            >
              {assignMutation.isPending ? "Assigning…" : "Assign Compliance Track"}
            </Button>
          </div>
        </div>
      )}

      {isLoading || !modules ? (
        <p className="text-sm text-muted-foreground">Loading modules…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {modules.map((m) => {
            const isFinal = m.sequence_order === 6;
            return (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]">
                <div className="flex items-start gap-3">
                  <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${isFinal ? "bg-amber-500/15 text-amber-600" : "bg-accent/15 text-accent"}`}>
                    {isFinal ? <Award className="h-5 w-5" /> : m.sequence_order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold tracking-tight">{m.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{m.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/dashboard/training/$id" params={{ id: m.id }}>
                      <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                      {isFinal ? "Open Quiz" : "Preview Module"}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isAdmin && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <BookOpen className="mx-auto h-5 w-5" />
          <p className="mt-2">Visit <Link to="/dashboard/courses" className="font-medium text-accent hover:underline">My Trainings</Link> for your personal compliance roadmap.</p>
        </div>
      )}
    </div>
  );
}
