import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { PiMark } from "@/components/pi-landing/pi-mark";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { useFirstLoginSetup } from "@/hooks/use-first-login-setup";
import {
  firstLoginHeadline,
  firstLoginProgressLabel,
  firstLoginSteps,
  type FirstLoginStep,
} from "@/lib/first-login-setup";
import { PI_CREAM, PI_GOLD, PI_NAVY } from "@/lib/pi-landing";
import { cn } from "@/lib/utils";

const OBLIGATIONS_LINE = "Built-in obligations are already covered.";

function sessionFirstName(user: {
  user_metadata?: Record<string, unknown>;
  email?: string | null;
} | null): string {
  const meta = user?.user_metadata ?? {};
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  if (first) return first;
  const full =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "";
  if (full) return full.split(/\s+/)[0] ?? "there";
  return user?.email?.split("@")[0]?.trim() || "there";
}

function StepRow({
  step,
  index,
  isNext,
}: {
  step: FirstLoginStep;
  index: number;
  isNext: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-4 border-t border-white/[0.08] py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8",
        !isNext && !step.done && "opacity-55",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span
            className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-[#f3efe6]/45"
            aria-hidden
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="font-display text-xl font-semibold tracking-tight text-[#f3efe6] sm:text-[1.35rem]">
            {step.title}
          </h3>
          {step.done ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8fbf98]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
              Done
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 max-w-md pl-10 text-sm leading-relaxed text-[#f3efe6]/62">
          {step.body}
        </p>
      </div>
      {isNext ? (
        <Link
          to={step.href}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-md px-5 py-2.5 text-sm font-medium tracking-tight transition hover:brightness-110 sm:self-center"
          style={{ background: PI_GOLD, color: PI_NAVY }}
        >
          {step.cta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </li>
  );
}

export function FirstLoginHome() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const setup = useFirstLoginSetup();
  const firstName = sessionFirstName(user);
  const orgName = org?.organization_name ?? "Your office";

  if (!setup.orgId && !setup.orgLoading) return null;

  const headline = firstLoginHeadline(setup.completedCount, firstName);
  const progressLine = firstLoginProgressLabel(setup.completedCount);
  const ratio = setup.totalSteps > 0 ? setup.completedCount / setup.totalSteps : 0;

  return (
    <section
      aria-label="Office setup"
      className="overflow-hidden rounded-2xl"
      style={{ background: PI_NAVY, color: PI_CREAM }}
    >
      <div className="px-6 py-8 sm:px-10 sm:py-12">
        <div className="flex items-start justify-between gap-4">
          <PiMark className="h-7 w-7 text-[#f3efe6]" title="Provider Interface" />
          <p className="text-right text-[11px] font-medium uppercase tracking-[0.2em] text-[#f3efe6]/40">
            {org ? orgName : "Provider Interface"}
          </p>
        </div>

        <p className="mt-10 text-sm font-medium tracking-tight text-[#f3efe6]/55">
          Welcome in, {firstName}.
        </p>
        <h1 className="mt-2 max-w-xl font-display text-[2.15rem] font-semibold leading-[1.12] tracking-tight text-[#f3efe6] sm:text-[2.75rem]">
          {setup.countsReady || setup.countsFailed ? headline : "Your office is ready."}
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[#f3efe6]/62">
          Three steps, in order. Then the week can hold.
        </p>

        <div className="mt-8 max-w-md">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium tracking-tight text-[#f3efe6]">
              {setup.countsReady ? progressLine : "Checking what is already in place"}
            </p>
            {setup.countsReady ? (
              <span className="tabular-nums text-xs text-[#f3efe6]/45">
                {setup.completedCount}/{setup.totalSteps}
              </span>
            ) : null}
          </div>
          <div className="mt-3 h-[2px] w-full bg-white/[0.08]">
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.min(100, Math.max(0, ratio * 100))}%`,
                background: PI_GOLD,
              }}
            />
          </div>
        </div>

        {setup.countsFailed ? (
          <p className="mt-10 text-sm text-[#f3efe6]/55">
            Could not load setup progress. You can still add staff, add a client, or open the
            scheduler from the menu.
          </p>
        ) : (
          <ol className="mt-4">
            {(setup.countsReady ? setup.steps : firstLoginSteps({
              memberCount: 0,
              clientCount: 0,
              shiftCount: 0,
            })).map((step, index) => (
              <StepRow
                key={step.key}
                step={step}
                index={index}
                isNext={setup.countsReady && setup.nextKey === step.key}
              />
            ))}
          </ol>
        )}

        <p className="mt-2 text-xs leading-relaxed tracking-tight text-[#f3efe6]/38">
          {OBLIGATIONS_LINE}
        </p>
      </div>
    </section>
  );
}
