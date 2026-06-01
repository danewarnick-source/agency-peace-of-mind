import { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";

export type LeaderboardEntry = {
  userId: string;
  name: string;
  score: number;
  hint: string;
};

const STORAGE = "hive.company-overview.leaderboard-dismissed.v1";

export function TeamLeaderboardCard({ items }: { items: LeaderboardEntry[] }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(window.localStorage.getItem(STORAGE) === "1");
    }
  }, []);
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE, "1");
  };

  return (
    <section className="relative rounded-2xl border border-border bg-card/80 p-5 shadow-card backdrop-blur">
      <button
        type="button"
        aria-label="Hide leaderboard"
        onClick={dismiss}
        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
          <Trophy className="h-4 w-4" />
        </span>
        <h2 className="font-display text-base font-semibold tracking-tight">Team leaderboard</h2>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Once staff start completing modules, the top performers land here.
        </p>
      ) : (
        <ol className="space-y-2">
          {items.slice(0, 5).map((e, idx) => (
            <li key={e.userId} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f4a93a]/15 text-xs font-bold text-[#7a4a0a]">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="truncate text-xs text-muted-foreground">{e.hint}</p>
              </div>
              <span className="shrink-0 font-display text-sm font-bold tabular-nums text-[#0d112b]">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
