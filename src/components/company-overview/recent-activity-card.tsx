import { Link } from "@tanstack/react-router";
import { Trophy, UserPlus, BadgeCheck, ArrowRight, type LucideIcon } from "lucide-react";

export type ActivityItem = {
  id: string;
  kind: "training_completed" | "new_hire" | "cert_approved" | "role_change";
  title: string;
  detail: string;
  at: string;
};

const ICONS: Record<ActivityItem["kind"], LucideIcon> = {
  training_completed: Trophy,
  new_hire: UserPlus,
  cert_approved: BadgeCheck,
  role_change: UserPlus,
};

export function RecentActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight">Recent activity</h2>
        <Link to="/dashboard/records-desk" className="inline-flex items-center gap-1 text-xs font-medium text-[#7a4a0a] hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          No activity yet — once your team starts moving, NECTAR will surface it here.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((it) => {
            const Icon = ICONS[it.kind];
            return (
              <li key={it.id} className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{it.detail}</p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {timeAgo(it.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}
