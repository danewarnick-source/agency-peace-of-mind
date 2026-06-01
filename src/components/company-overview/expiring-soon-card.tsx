import { Link } from "@tanstack/react-router";
import { BadgeCheck, ArrowRight } from "lucide-react";

export type ExpiringCert = {
  id: string;
  staffName: string | null;
  certName: string | null;
  expiresAt: string;
  daysUntil: number;
};

export function ExpiringSoonCard({ items }: { items: ExpiringCert[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
            <BadgeCheck className="h-4 w-4" />
          </span>
          <h2 className="font-display text-base font-semibold tracking-tight">Expiring soon</h2>
        </div>
        <Link to="/dashboard/certifications" className="inline-flex items-center gap-1 text-xs font-medium text-[#7a4a0a] hover:underline">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
          Nothing expiring — you're current.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.slice(0, 6).map((it) => {
            const urgent = it.daysUntil <= 30;
            return (
              <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {it.certName ?? "Certification"} <span className="text-muted-foreground">· {it.staffName ?? "Staff"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due {new Date(it.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                  urgent
                    ? "border-[#f4a93a]/40 bg-[#f4a93a]/10 text-[#7a4a0a]"
                    : "border-border bg-muted text-muted-foreground"
                }`}>
                  {it.daysUntil}d
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
