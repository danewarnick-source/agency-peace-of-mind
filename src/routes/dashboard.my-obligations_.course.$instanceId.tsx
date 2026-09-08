import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { InHiveCoursePlayer } from "@/components/training/in-hive-course-player";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { getObligationInstanceContext } from "@/lib/company-obligations.functions";
import {
  inHiveCourseIdForTitle,
  lastExamResetAt,
} from "@/lib/in-hive-training";
import { thirtyDayCourseAccessFn } from "@/lib/in-hive-training-access.functions";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/my-obligations_/course/$instanceId")({
  head: () => ({ meta: [{ title: "Staff training — Provider Interface" }] }),
  component: InHiveCoursePage,
});

function InHiveCoursePage() {
  const { instanceId } = Route.useParams();
  const { user } = useAuth();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const orgId = org?.organization_id;
  const fetchCtx = useServerFn(getObligationInstanceContext);
  const accessFn = useServerFn(thirtyDayCourseAccessFn);

  const ctxQ = useQuery({
    queryKey: ["obligation-instance-context", orgId, instanceId],
    enabled: !!orgId && !!user,
    queryFn: () => fetchCtx({ data: { organizationId: orgId!, instanceId } }),
  });

  const profileQ = useQuery({
    queryKey: ["in-hive-signer", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("full_name, email")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { full_name: string | null; email: string | null } | null;
    },
  });

  const courseIdPreview = ctxQ.data?.obligation
    ? inHiveCourseIdForTitle(ctxQ.data.obligation.title)
    : null;

  const accessQ = useQuery({
    queryKey: ["thirty-day-course-access", orgId, user?.id],
    enabled: !!orgId && !!user && courseIdPreview === "thirty-day",
    queryFn: () => accessFn({ data: { organizationId: orgId! } }),
  });

  if (!user) {
    return <p className="text-sm text-muted-foreground p-4">Sign in to open this course.</p>;
  }
  if (orgLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading organization…</p>;
  }
  if (!org || !orgId) {
    return <p className="text-sm text-muted-foreground p-4">No organization is selected.</p>;
  }

  if (ctxQ.isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading course…</p>;
  }

  const obligation = ctxQ.data?.obligation;
  const instance = ctxQ.data?.instance;
  const courseId = obligation ? inHiveCourseIdForTitle(obligation.title) : null;

  if (!obligation || !instance || !courseId) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          This obligation does not open an in-platform course.
        </p>
        <Link to="/dashboard/my-obligations" className="text-sm font-medium text-[var(--hive-ink)] hover:underline">
          Back to My Obligations
        </Link>
      </div>
    );
  }

  const signedName =
    profileQ.data?.full_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email ||
    "Staff";
  const alreadyComplete =
    instance.status === "completed" || instance.status === "waived";
  const examResetAfterIso = lastExamResetAt(instance.admin_notes, user.id);
  const needsSeat = courseId === "thirty-day";
  const accessBlocked =
    needsSeat &&
    (accessQ.isError || (accessQ.isSuccess && accessQ.data && !accessQ.data.allowed));

  return (
    <div className="w-full space-y-4">
      <StaffPageHeader
        eyebrow="My Obligations"
        eyebrowIcon={ClipboardList}
        title={obligation.title}
        subtitle="Complete each topic, then the competency exam. You can leave and pick up where you left off."
      />
      {needsSeat && accessQ.isLoading ? (
        <p className="text-sm text-muted-foreground p-4">Checking training access…</p>
      ) : accessBlocked ? (
        <div className="rounded-xl border bg-card p-5 text-sm space-y-3">
          <p className="font-medium">
            {accessQ.isError
              ? "Could not confirm a 30-day training seat"
              : "A 30-day training seat is required"}
          </p>
          <p className="text-muted-foreground">
            {accessQ.isError
              ? "Refresh and try again. If this continues, ask an admin to confirm your seat."
              : "Paid agencies purchase the 30-day course ($75 per person) or the pack from Training. An admin assigns your name on the roster after checkout. True North Supports is never charged and does not need a purchased seat."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/dashboard/hive-training">Open Training</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard/my-obligations">Back to My Obligations</Link>
            </Button>
          </div>
        </div>
      ) : (
        <InHiveCoursePlayer
          organizationId={orgId}
          userId={user.id}
          signedName={String(signedName)}
          signerEmail={profileQ.data?.email ?? user.email ?? null}
          courseId={courseId}
          instanceId={instanceId}
          obligationTitle={obligation.title}
          alreadyComplete={alreadyComplete}
          examResetAfterIso={examResetAfterIso}
          organizationName={
            accessQ.data?.organizationName || org.organization_name || "Provider agency"
          }
        />
      )}
    </div>
  );
}
