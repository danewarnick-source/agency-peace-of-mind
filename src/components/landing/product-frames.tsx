/**
 * Steel-theme product frames for the marketing landing.
 *
 * These recreate this branch's IA in the locked room (dusty steel sidebar,
 * pale canvas, white cards, gold jewelry). They are not cropped live
 * screenshots from the old dark-gold theme, and they do not invent a
 * Nectar SOW interview.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Contact2,
  FolderOpen,
  LayoutDashboard,
  Lock,
  Scale,
  Shield,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { HiveMark } from "@/components/brand/hive-mark";
import { NectarBadge, NectarMark } from "@/components/nectar/nectar-brand";

const ADMIN_NAV: { label: string; icon: LucideIcon }[] = [
  { label: "Home", icon: LayoutDashboard },
  { label: "Employees", icon: Users },
  { label: "Clients", icon: Contact2 },
  { label: "Scheduler", icon: CalendarDays },
  { label: "Documentation", icon: ClipboardCheck },
  { label: "Daily Logs", icon: ClipboardCheck },
  { label: "Compliance", icon: ClipboardList },
];

const STAFF_NAV: { label: string; icon: LucideIcon }[] = [
  { label: "My Caseload", icon: LayoutDashboard },
  { label: "Schedule", icon: CalendarDays },
  { label: "Daily Logs", icon: ClipboardCheck },
  { label: "My Compliance", icon: ClipboardList },
  { label: "Nectar", icon: Sparkles },
];

function ProductChrome({
  active,
  variant = "admin",
  children,
  tall = false,
}: {
  active: string;
  variant?: "admin" | "staff";
  children: ReactNode;
  tall?: boolean;
}) {
  const nav = variant === "staff" ? STAFF_NAV : ADMIN_NAV;
  return (
    <div
      aria-hidden
      className={`overflow-hidden rounded-xl border border-[var(--hive-border)] bg-[var(--hive-canvas)] shadow-[var(--shadow-elegant)] ${
        tall ? "min-h-[440px]" : "min-h-[380px]"
      }`}
    >
      <div className="flex min-h-inherit">
        <aside className="hidden w-[88px] shrink-0 flex-col bg-[var(--hive-sidebar)] py-3 sm:flex">
          <div className="flex justify-center pb-2">
            <HiveMark className="h-7 w-7" />
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 px-1.5">
            {nav.map(({ label, icon: Icon }) => {
              const isActive = label === active;
              return (
                <div
                  key={label}
                  className={`relative flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[8px] leading-tight ${
                    isActive ? "hive-nav-active" : "text-[var(--hive-chrome-text)]/70"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                  <span className="text-center">{label}</span>
                </div>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-[var(--hive-border)] bg-[var(--hive-surface)] px-3 py-2">
            <span className="font-display text-[11px] font-semibold text-[var(--hive-text)]">
              {active}
            </span>
            <span className="relative grid h-6 w-6 place-items-center text-[var(--hive-text-muted)]">
              <Bell className="h-3.5 w-3.5" />
              <span className="absolute -right-0.5 -top-0.5 grid h-3 min-w-3 place-items-center rounded-full bg-[var(--hive-gold)] px-0.5 text-[7px] font-bold text-[var(--hive-on-gold)]">
                2
              </span>
            </span>
          </header>
          <div className="bg-[var(--hive-canvas)] p-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Compliance register — Client-Specific Training with the live SOW cite. */
export function FrameComplianceTraining() {
  return (
    <ProductChrome active="Compliance" tall>
      <div className="mb-2 flex items-center gap-1.5">
        <ClipboardList className="h-3.5 w-3.5 text-[var(--hive-text)]" />
        <h3 className="text-[12px] font-semibold text-[var(--hive-text)]">Compliance register</h3>
      </div>
      <div className="mb-2 flex flex-wrap gap-1 border-b border-[var(--hive-border)] pb-1.5">
        {["Obligations", "Utah pack", "Authoritative Sources", "Action Required"].map((tab, i) => (
          <span
            key={tab}
            className={`px-2 py-1 text-[10px] font-medium ${
              i === 0
                ? "border-b-2 border-[var(--hive-gold)] text-[var(--hive-text)]"
                : "text-[var(--hive-text-muted)]"
            }`}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <span className="text-[9px] text-[var(--hive-text-muted)]">This program's services</span>
        {["HHS", "SLH", "DSI", "SEI"].map((c) => (
          <span
            key={c}
            className="rounded-full bg-[var(--secondary)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--hive-text)]"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-3 shadow-[var(--shadow-card)]">
        <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--hive-text)]">
          <Lock className="h-3 w-3 shrink-0 text-[var(--hive-text)]" />
          <span>Client-Specific Training — [Client Name]</span>
        </h4>
        <p className="mt-0.5 text-[11px] text-[var(--hive-text-muted)]">
          SOW §1.8(4)(O) — Person-Specific Training
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--hive-ok-soft)] px-2 py-0.5 text-[9px] font-semibold text-[var(--hive-ok-fg)]">
            <FolderOpen className="h-3 w-3" />
            Tracked in HIVE
          </span>
        </div>
        <p className="mt-2 text-[10px] text-[var(--hive-text-muted)]">
          Assigned to: All active staff+client assignments
        </p>
        <div className="mt-2 border-t border-[var(--hive-border)] pt-2">
          <p className="text-[10px] font-medium text-[var(--hive-text)]">Details &amp; SOW explanation</p>
          <div className="mt-1.5 space-y-1.5 rounded-md border border-[var(--hive-border)] bg-[var(--hive-canvas)] p-2 text-[10px] leading-relaxed text-[var(--hive-text-muted)]">
            <p>
              <span className="font-medium text-[var(--hive-text)]">Citation: </span>
              DHHS91172 SOW §1.8(4)(O)
            </p>
            <p>
              <span className="font-medium text-[var(--hive-text)]">What HIVE tracks: </span>
              One instance per staff+client assignment, due 30 days after assignment. Complete
              the linked form in HIVE.
            </p>
            <p>
              <span className="font-medium text-[var(--hive-text)]">Evidence a reviewer expects: </span>
              Person-specific training covering disability/goals, medical/safety, PCSP/BSP/strategies,
              staff responsibilities, DNR/POLST and hospice if applicable.
            </p>
          </div>
        </div>
      </div>
    </ProductChrome>
  );
}

/** Documentation hub — Human Rights Committee tab. */
export function FrameDocumentationHrc() {
  return (
    <ProductChrome active="Documentation" tall>
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--hive-text)]">Documentation</h3>
      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--hive-border)]">
        {["Records", "Incidents", "Forms", "Audit", "Human Rights Committee"].map((tab) => {
          const on = tab === "Human Rights Committee";
          return (
            <span
              key={tab}
              className={`whitespace-nowrap px-2 py-1.5 text-[10px] font-medium ${
                on
                  ? "border-b-2 border-[var(--hive-gold)] text-[var(--hive-text)]"
                  : "text-[var(--hive-text-muted)]"
              }`}
            >
              {tab}
            </span>
          );
        })}
      </div>
      <div className="rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)] p-3">
        <div className="flex items-start gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--hive-gold-soft)] text-[var(--hive-gold)]">
            <Scale className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-[12px] font-semibold text-[var(--hive-text)]">
              Human Rights Committee (HRC)
            </h4>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--hive-text-muted)]">
              Client-rights body that reviews restrictions on a person's rights. This is not
              Human Resources / staff HR.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)] p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--hive-text)]">
          <ShieldAlert className="h-3.5 w-3.5 text-[var(--hive-gold)]" />
          Clients with rights restrictions
        </div>
        <p className="mt-1 text-[10px] leading-snug text-[var(--hive-text-muted)]">
          Each active restriction must document all 8 required elements (SOW §1.20 / HCBS
          Settings Rule) before it counts as fully documented.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {["Consent", "Assessed need", "Positive interventions", "Less intrusive methods"].map(
            (el) => (
              <span
                key={el}
                className="rounded border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-1.5 py-1 text-[9px] text-[var(--hive-text)]"
              >
                {el}
              </span>
            ),
          )}
        </div>
      </div>
    </ProductChrome>
  );
}

/** Scheduler — SLH Supported Living + DSI Individual Day Support. */
export function FrameSchedulerSlhDsi() {
  return (
    <ProductChrome active="Scheduler" tall>
      <div className="mb-2 flex items-center gap-3 text-[9px] text-[var(--hive-text-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--hive-gold)]" /> Staff
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--hive-ok)]" /> Client
        </span>
      </div>
      <div className="space-y-2">
        <div className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-[#3b6aa8] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
              SLH
            </span>
            <span className="text-[11px] font-semibold text-[var(--hive-text)]">Supported Living</span>
          </div>
          <div className="flex gap-1.5">
            <div className="flex-1 rounded-md border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-2 py-1.5">
              <p className="text-[10px] font-medium text-[var(--hive-text)]">Priya Lang</p>
              <p className="text-[9px] text-[var(--hive-text-muted)]">Riley · 8:00a – 2:00p</p>
            </div>
            <div className="flex-1 rounded-md border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-2 py-1.5">
              <p className="text-[10px] font-medium text-[var(--hive-text)]">Priya Lang</p>
              <p className="text-[9px] text-[var(--hive-text-muted)]">Riley · 2:00p – 8:00p</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-[#7eb45b] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
              DSI
            </span>
            <span className="text-[11px] font-semibold text-[var(--hive-text)]">
              Individual Day Support
            </span>
          </div>
          <div className="flex gap-1.5">
            <div className="flex-1 rounded-md border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-2 py-1.5">
              <p className="text-[10px] font-medium text-[var(--hive-text)]">Noah Kessler</p>
              <p className="text-[9px] text-[var(--hive-text-muted)]">Riley · 9:00a – 3:00p · 6h max</p>
            </div>
          </div>
        </div>
      </div>
    </ProductChrome>
  );
}

/** Host Home Supports daily note — hosts do not clock. */
export function FrameHhsDailyNote() {
  return (
    <ProductChrome active="Daily Logs" variant="staff" tall>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--hive-gold)]">
        Host Home · Daily Compliance Journal
      </p>
      <h3 className="mt-0.5 text-[13px] font-semibold text-[var(--hive-text)]">Daily Logs</h3>
      <p className="mb-2 text-[10px] text-[var(--hive-text-muted)]">
        Host Home Supports (HHS) — select a client to submit today's PCSP narrative and signature.
      </p>
      <div className="rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)] p-3">
        <div className="mb-2 flex items-start gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--hive-canvas)] text-[10px] font-semibold text-[var(--hive-text)]">
            CB
          </span>
          <div>
            <p className="text-[11px] font-semibold text-[var(--hive-text)]">
              Cole Brennan <span className="font-mono font-normal text-[var(--hive-text-muted)]">HHS</span>
            </p>
            <p className="text-[10px] text-[var(--hive-text-muted)]">
              Daily note — hosts do not clock in
            </p>
          </div>
        </div>
        <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-2 py-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--hive-surface)] text-[9px] font-semibold text-[var(--hive-text)]">
            ME
          </span>
          <p className="text-[10px] text-[var(--hive-text)]">
            Maya Ellison <span className="font-mono text-[var(--hive-text-muted)]">HHS</span>
            <span className="ml-1.5 text-[var(--hive-text-muted)]">Host Home · note due</span>
          </p>
        </div>
        <h4 className="text-[11px] font-semibold text-[var(--hive-text)]">
          Host Home Daily Compliance Journal
        </h4>
        <p className="mt-2 text-[10px] font-medium text-[var(--hive-text)]">PCSP Goals Addressed Today</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="rounded-full border border-[var(--hive-text)] bg-[var(--hive-text)] px-2 py-0.5 text-[9px] text-white">
            ✓ Community participation
          </span>
          <span className="rounded-full border border-[var(--hive-border)] bg-[var(--hive-surface)] px-2 py-0.5 text-[9px] text-[var(--hive-text)]">
            Daily living skills
          </span>
        </div>
        <p className="mt-2 text-[10px] font-medium text-[var(--hive-text)]">Daily Summary Narrative</p>
        <div className="mt-1 min-h-[52px] rounded-md border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-2 py-1.5 text-[9px] text-[var(--hive-text-muted)]">
          Describe today's care, activities, mood, meals, incidents, and goal progress in detail…
        </div>
        <p className="mt-1 text-[9px] text-[var(--hive-text-muted)]">0 / 40 words</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--hive-canvas)] text-[9px] font-semibold text-[var(--hive-text)]">
            R
          </span>
          <div className="h-10 flex-1 rounded-lg border-2 border-[var(--hive-border)] bg-white" />
        </div>
        <p className="mt-1 text-[9px] text-[var(--hive-text-muted)]">Caregiver Signature · Riley</p>
      </div>
    </ProductChrome>
  );
}

/**
 * Ask Nectar empty state — real starter chips only.
 * No composed SOW Q&A thread.
 */
const ASK_NECTAR_STARTERS = [
  "What are my client's PCSP goals today?",
  "Walk me through the reimbursement process.",
  "What's the medication procedure for a missed dose?",
  "How many hours have I worked this period?",
] as const;

export function FrameAskNectar() {
  return (
    <ProductChrome active="Nectar" variant="staff" tall>
      <div className="overflow-hidden rounded-xl border border-[var(--hive-border)] bg-[var(--hive-surface)]">
        <div className="flex items-center gap-2 bg-[var(--hive-sidebar)] px-3 py-2">
          <NectarMark size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <NectarBadge size="xs" />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--hive-chrome-text)]/80">
                Staff assistant
              </span>
            </div>
            <p className="font-display text-[11px] font-bold text-[var(--hive-chrome-text)]">
              Ask NECTAR · Staff
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--hive-gold)]/40 bg-[var(--hive-gold)]/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-[var(--hive-gold)]">
            <Shield className="h-2.5 w-2.5" /> PHI
          </span>
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-start gap-1.5 rounded-lg border border-[var(--hive-gold)]/30 bg-[var(--hive-gold-soft)] px-2.5 py-1.5 text-[10px] leading-snug text-[var(--hive-on-gold)]">
            <Shield className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Client info here is for people on your caseload — treat as confidential PHI.
            </span>
          </div>
          <p className="text-[11px] leading-snug text-[var(--hive-text-muted)]">
            I help with company policies, your trainings, job duties, your pay, and the people
            on your caseload — their goals, safety, and meds.
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--hive-text-muted)]">
            Try asking
          </p>
          <div className="space-y-1.5">
            {ASK_NECTAR_STARTERS.map((s) => (
              <div
                key={s}
                className="rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)] px-2.5 py-2 text-left text-[11px] leading-snug text-[var(--hive-text)]"
              >
                {s}
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--hive-border)] px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-8 flex-1 rounded-full border border-[var(--hive-border)] bg-[var(--hive-canvas)] px-3 text-[10px] leading-8 text-[var(--hive-text-muted)]">
              Ask NECTAR anything about your training…
            </div>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--hive-gold)] text-[var(--hive-on-gold)]">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>
    </ProductChrome>
  );
}

