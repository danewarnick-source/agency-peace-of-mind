import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { InHiveCoursePlayer } from "@/components/training/in-hive-course-player";
import { PiPublicPage } from "@/components/pi-landing/pi-public-page";
import { THIRTY_DAY_OBLIGATION_TITLE } from "@/lib/in-hive-training";
import { trainingOnlyHomeForMeFn } from "@/lib/training-only-access.functions";

export const Route = createFileRoute("/training/course")({
  head: () => ({
    meta: [{ title: "30-day course — Provider Interface Training" }],
  }),
  component: TrainingOnlyCoursePage,
});

function TrainingOnlyCoursePage() {
  const { session, loading } = useAuth();
  const homeFn = useServerFn(trainingOnlyHomeForMeFn);
  const q = useQuery({
    queryKey: ["training-only-home", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: () => homeFn(),
  });

  const user = session?.user;
  const seat = q.data?.seats[0];

  return (
    <PiPublicPage>
      <main className="wrap pi-home-commerce">
        <section className="mx-auto max-w-3xl">
          <p className="pi-home-kicker">Training only</p>
          <h1>30-day course</h1>
          <p className="pi-home-lede">
            This login opens the course. It does not open the office.
          </p>

          <div className="mt-8 rounded-2xl border border-white/[0.10] bg-[#f3efe6] p-5 text-[#0b1220] sm:p-7">
            {loading ? (
              <p className="text-sm">Checking your session…</p>
            ) : !user ? (
              <div>
                <p className="text-sm">Sign in with the training-only login the office sent.</p>
                <Link
                  to="/login"
                  search={{ next: "/training/course" }}
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-[#0b1220] px-4 text-sm font-semibold text-[#f3efe6]"
                >
                  Sign in
                </Link>
              </div>
            ) : q.isLoading ? (
              <p className="text-sm">Looking up your seat…</p>
            ) : !q.data?.hasThirtyDay || !seat ? (
              <p className="text-sm">
                No 30-day seat is attached to this login yet. The office sends access after
                payment. CPR and Mandt stay as class seats.
              </p>
            ) : (
              <div data-testid="training-only-course">
                <p className="mb-4 text-sm">
                  Seat for <span className="font-medium">{seat.personName}</span>
                  {seat.classDate ? ` · class ${seat.classDate}` : ""}
                </p>
                <InHiveCoursePlayer
                  organizationId=""
                  userId={user.id}
                  signedName={seat.personName}
                  signerEmail={user.email ?? null}
                  courseId="thirty-day"
                  instanceId={seat.seatId}
                  obligationTitle={THIRTY_DAY_OBLIGATION_TITLE}
                  alreadyComplete={false}
                  examResetAfterIso={null}
                  skipObligation
                  organizationName="Training-only seat"
                />
              </div>
            )}
          </div>
        </section>
      </main>
    </PiPublicPage>
  );
}
