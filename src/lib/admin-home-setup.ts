/**
 * Admin Home first-login checklist — progress math and copy.
 *
 * Home walks a new owner through the platform. Built-in company
 * obligations stay in the office; they are not a Home action.
 */

export const ADMIN_HOME_SETUP_KEY = "admin-home-setup";
export const ADMIN_HOME_SETUP_TOTAL = 3;

export const DENVER_TZ = "America/Denver";

export type AdminHomeSetupCounts = {
  memberCount: number;
  pendingInviteCount: number;
  clientCount: number;
  shiftCount: number;
};

export type AdminHomeSetupStepId = "staff" | "client" | "shift";

export type AdminHomeSetupHref =
  | "/dashboard/hub/employees"
  | "/dashboard/hub/clients"
  | "/dashboard/scheduler";

export type AdminHomeSetupStep = {
  id: AdminHomeSetupStepId;
  title: string;
  body: string;
  cta: string;
  doneLabel: string;
  href: AdminHomeSetupHref;
  done: boolean;
};

export type AdminHomeSetupProgress = {
  done: number;
  total: number;
  nextId: AdminHomeSetupStepId | null;
  allComplete: boolean;
};

export const EMPTY_ADMIN_HOME_SETUP_COUNTS: AdminHomeSetupCounts = {
  memberCount: 0,
  pendingInviteCount: 0,
  clientCount: 0,
  shiftCount: 0,
};

export function adminHomeSetupQueryKey(orgId: string | null) {
  return [ADMIN_HOME_SETUP_KEY, orgId] as const;
}

/** Owner is already a member. First staff = a second person, or an invite out. */
export function hasAddedFirstStaff(counts: AdminHomeSetupCounts): boolean {
  return counts.memberCount > 1 || counts.pendingInviteCount > 0;
}

export function hasAddedFirstClient(counts: AdminHomeSetupCounts): boolean {
  return counts.clientCount > 0;
}

export function hasScheduledFirstShift(counts: AdminHomeSetupCounts): boolean {
  return counts.shiftCount > 0;
}

export function buildAdminHomeSetupSteps(
  counts: AdminHomeSetupCounts,
): AdminHomeSetupStep[] {
  return [
    {
      id: "staff",
      title: "Add your first staff",
      body: "Invite someone in. The day gets real when people are in the room.",
      cta: "Add staff",
      doneLabel: "Staff is in",
      href: "/dashboard/hub/employees",
      done: hasAddedFirstStaff(counts),
    },
    {
      id: "client",
      title: "Add your first client",
      body: "A name, and the office has someone to hold.",
      cta: "Add client",
      doneLabel: "A client is in",
      href: "/dashboard/hub/clients",
      done: hasAddedFirstClient(counts),
    },
    {
      id: "shift",
      title: "Schedule a shift",
      body: "Put a day on the calendar. The week starts to stand.",
      cta: "Open the schedule",
      doneLabel: "A shift is on the calendar",
      href: "/dashboard/scheduler",
      done: hasScheduledFirstShift(counts),
    },
  ];
}

export function adminHomeSetupProgress(
  steps: readonly AdminHomeSetupStep[],
): AdminHomeSetupProgress {
  const done = steps.filter((step) => step.done).length;
  const total = steps.length;
  return {
    done,
    total,
    nextId: steps.find((step) => !step.done)?.id ?? null,
    allComplete: total > 0 && done === total,
  };
}

export function adminHomeProgressLine(done: number, total: number): string {
  return `You're ${done} of ${total} set up.`;
}

export const ADMIN_HOME_HEADLINE_OPEN = "The office is open.";
export const ADMIN_HOME_HEADLINE_STANDING = "The office is standing.";
export const ADMIN_HOME_SUPPORT_OPEN = "Three quiet steps. Then the week can hold.";
export const ADMIN_HOME_SUPPORT_STANDING =
  "People, a name, a day on the calendar. You can go home.";
export const ADMIN_HOME_OBLIGATIONS_QUIET =
  "Required company work is already in the office. You do not need to upload anything to get started.";

export function adminHomeHeadline(allComplete: boolean): string {
  return allComplete ? ADMIN_HOME_HEADLINE_STANDING : ADMIN_HOME_HEADLINE_OPEN;
}

export function adminHomeSupport(allComplete: boolean): string {
  return allComplete ? ADMIN_HOME_SUPPORT_STANDING : ADMIN_HOME_SUPPORT_OPEN;
}

export function denverHour(date: Date): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: DENVER_TZ,
    hour: "numeric",
    hour12: false,
  }).format(date);
  const hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour) || hour === 24) return 0;
  return hour;
}

export function greetingWord(date: Date): "morning" | "afternoon" | "evening" {
  const hour = denverHour(date);
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function sessionFirstName(user: {
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
  const fromEmail = user?.email?.split("@")[0]?.trim();
  return fromEmail || "there";
}

export function formatDenverLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: DENVER_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
