import { type ReactNode, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useActiveShift } from "@/hooks/use-active-shift";
import type { CaseloadClient } from "@/hooks/use-caseload";
import {
  AlertTriangle,
  Target,
  Phone,
  Heart,
  IdCard,
  ChevronRight,
} from "lucide-react";

type Props = {
  client: CaseloadClient;
  trigger: ReactNode;
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" },
    );
  } catch {
    return d;
  }
}

function fmtElapsed(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Pull-up Quick-Info bottom sheet for a client. Reusable from the caseload
 * card and the workspace header. Safe to open mid-shift — when the active
 * shift matches this client an "On the clock" chip appears in the header.
 */
export function ClientQuickInfoSheet({ client, trigger }: Props) {
  const { data: active } = useActiveShift();
  const isOnTheClock = !!active && active.client_id === client.id;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isOnTheClock) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [isOnTheClock]);

  const fullName = `${client.first_name} ${client.last_name}`.trim();
  const goals = client.pcsp_goals ?? [];
  const todaysGoal = goals[0];
  const elapsed = isOnTheClock && active
    ? fmtElapsed(now - new Date(active.clock_in_timestamp).getTime())
    : "";

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-2xl border-t-4 border-[color:var(--amber-500,#f4a93a)] bg-background p-0"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2">
          <span className="h-1.5 w-12 rounded-full bg-muted-foreground/30" aria-hidden />
        </div>

        <SheetHeader className="space-y-1 px-5 pt-3 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="break-words text-lg leading-tight">
                {fullName}
              </SheetTitle>
              <p className="break-words text-xs text-muted-foreground">
                Quick info · safety first
              </p>
            </div>
            {isOnTheClock && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#117a52]/10 px-2.5 py-1 text-[11px] font-semibold text-[#0d5c3d]">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#15a06a] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#15a06a]" />
                </span>
                On the clock · <span className="font-mono tabular-nums">{elapsed}</span>
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-3 px-5 pb-8 pt-4">
          {/* (a) Safety & trigger flags + allergies / medical alerts */}
          <Section
            tone="caution"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Safety, Trigger Flags & Allergies"
          >
            {client.special_directions ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {client.special_directions}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No safety flags, triggers, or allergy alerts on file. Confirm with
                supervisor before any procedure.
              </p>
            )}
          </Section>

          {/* (b) PCSP goals — today + view all */}
          <Section
            tone="success"
            icon={<Target className="h-4 w-4" />}
            title="PCSP Goals"
          >
            {todaysGoal ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0d5c3d]">
                  Today&apos;s focus
                </p>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {todaysGoal}
                </p>
                {goals.length > 1 && (
                  <details className="mt-3">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#0d5c3d] hover:underline">
                      View all {goals.length} goals
                      <ChevronRight className="h-3 w-3" />
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {goals.slice(1).map((g, i) => (
                        <li
                          key={i}
                          className="rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-sm"
                        >
                          {g}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No PCSP goals on file.
              </p>
            )}
          </Section>

          {/* (c) Emergency contacts incl. on-call supervisor */}
          <Section
            tone="info"
            icon={<Phone className="h-4 w-4" />}
            title="Emergency Contacts"
          >
            <ContactRow
              label="Emergency contact"
              name={client.emergency_contact_name}
              phone={client.emergency_contact_phone}
            />
            <ContactRow
              label="On-call supervisor"
              name="See team roster"
              phone={null}
              muted
            />
          </Section>

          {/* (d) Interests & hobbies */}
          <Section
            tone="neutral"
            icon={<Heart className="h-4 w-4" />}
            title="Interests & Hobbies"
          >
            <p className="text-sm text-muted-foreground">
              Build rapport — ask about preferred activities at the start of shift.
              Add details from the About tab to keep this fresh.
            </p>
          </Section>

          {/* (e) Key IDs */}
          <Section
            tone="neutral"
            icon={<IdCard className="h-4 w-4" />}
            title="Key IDs & Address"
          >
            <KvRow k="Medicaid ID" v={client.medicaid_id ?? "—"} mono />
            <KvRow k="Date of birth" v={fmtDate(client.date_of_birth)} />
            <KvRow k="Address" v={client.physical_address ?? "—"} />
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  tone,
  icon,
  title,
  children,
}: {
  tone: "caution" | "success" | "info" | "neutral";
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const palette = {
    caution: {
      wrap: "border-rose-300 bg-rose-50",
      head: "text-rose-800",
      icon: "bg-rose-500 text-white",
    },
    success: {
      wrap: "border-emerald-300 bg-emerald-50",
      head: "text-emerald-800",
      icon: "bg-[#117a52] text-white",
    },
    info: {
      wrap: "border-sky-300 bg-sky-50",
      head: "text-sky-800",
      icon: "bg-sky-600 text-white",
    },
    neutral: {
      wrap: "border-border bg-card",
      head: "text-foreground",
      icon: "bg-[color:var(--navy-900,#0d112b)] text-white",
    },
  }[tone];

  return (
    <section className={`rounded-xl border p-3 ${palette.wrap}`}>
      <header className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${palette.icon}`}
          aria-hidden
        >
          {icon}
        </span>
        <h3 className={`text-sm font-semibold ${palette.head}`}>{title}</h3>
      </header>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ContactRow({
  label,
  name,
  phone,
  muted = false,
}: {
  label: string;
  name: string | null;
  phone: string | null;
  muted?: boolean;
}) {
  if (!name && !phone) {
    return (
      <p className="text-sm text-muted-foreground">
        {label}: not on file
      </p>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white/70 px-2.5 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`truncate text-sm font-medium ${muted ? "text-muted-foreground" : "text-foreground"}`}>
          {name ?? "—"}
        </p>
      </div>
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700"
        >
          <Phone className="h-3.5 w-3.5" /> Call
        </a>
      ) : null}
    </div>
  );
}

function KvRow({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {k}
      </span>
      <span className={`text-right text-sm ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}
