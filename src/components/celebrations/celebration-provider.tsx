import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Hexagon, Sparkles } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import {
  listActiveCelebrations,
  acknowledgeCelebration,
  evaluateCelebrationTriggers,
  type ActiveCelebration,
} from "@/lib/celebrations.functions";
import { CelebrationBanner, describeCelebration } from "./celebration-banner";
import { CelebrationModal } from "./celebration-modal";

const SHOWN_KEY = "hive.celebrations.shown-ids.v1";

function loadShown(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
function saveShown(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SHOWN_KEY, JSON.stringify([...ids].slice(-200)));
}

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const fetchList = useServerFn(listActiveCelebrations);
  const ackFn = useServerFn(acknowledgeCelebration);
  const evalFn = useServerFn(evaluateCelebrationTriggers);

  const [shownIds, setShownIds] = useState<Set<string>>(() => loadShown());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [activeModal, setActiveModal] = useState<ActiveCelebration | null>(null);

  // Run the trigger evaluator once per org per session, and on window focus.
  useEffect(() => {
    if (!orgId) return;
    evalFn({ data: { organizationId: orgId } }).catch(() => undefined);
    const onFocus = () => {
      evalFn({ data: { organizationId: orgId } }).catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [orgId, evalFn]);

  const { data } = useQuery({
    enabled: !!orgId,
    queryKey: ["celebrations", orgId],
    queryFn: () => fetchList({ data: { organizationId: orgId! } }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const celebrations: ActiveCelebration[] = useMemo(() => data?.celebrations ?? [], [data]);

  const markShownPersistent = (id: string) => {
    setShownIds((cur) => {
      const next = new Set(cur);
      next.add(id);
      saveShown(next);
      return next;
    });
  };

  const handleAck = (id: string) => {
    setDismissed((cur) => {
      const next = new Set(cur);
      next.add(id);
      return next;
    });
    ackFn({ data: { eventId: id } }).catch(() => undefined);
  };

  // Tier 1 toasts — fire once per celebration id per browser.
  useEffect(() => {
    for (const c of celebrations) {
      if (c.tier !== 1) continue;
      if (shownIds.has(c.id)) continue;
      const m = describeCelebration(c);
      toast(m.title, {
        description: m.detail,
        duration: 4000,
        icon: (
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0d112b] text-[#f4a93a]">
            <Hexagon className="h-3.5 w-3.5" fill="currentColor" strokeWidth={1.25} />
            <Sparkles className="absolute -right-0.5 -top-0.5 h-3 w-3 text-[#f4a93a]" strokeWidth={2.5} />
          </span>
        ),
        style: {
          background: "linear-gradient(135deg, #fff8ec 0%, #fef0d6 100%)",
          border: "1px solid rgba(244,169,58,0.45)",
          color: "#0d112b",
        },
      });
      markShownPersistent(c.id);
      handleAck(c.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrations]);

  // Tier 3 modal — pick the most recent unseen one.
  useEffect(() => {
    if (activeModal) return;
    const next = celebrations.find(
      (c: ActiveCelebration) => c.tier === 3 && !dismissed.has(c.id) && !shownIds.has(c.id),
    );
    if (next) setActiveModal(next);
  }, [celebrations, activeModal, dismissed, shownIds]);

  return (
    <>
      {children}
      <CelebrationBannerPortal
        items={celebrations.filter((c: ActiveCelebration) => c.tier === 2 && !dismissed.has(c.id))}
        onDismiss={handleAck}
      />
      {activeModal && (
        <CelebrationModal
          celebration={activeModal}
          onClose={() => {
            markShownPersistent(activeModal.id);
            handleAck(activeModal.id);
            setActiveModal(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Floating banner stack — bottom-right on desktop, top on mobile.
 * Lightweight so it doesn't have to be threaded through context.
 */
function CelebrationBannerPortal({
  items,
  onDismiss,
}: {
  items: ActiveCelebration[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[80] flex flex-col gap-2 md:inset-auto md:bottom-6 md:right-6 md:top-auto md:max-w-md">
      {items.slice(0, 3).map((c) => (
        <div key={c.id} className="pointer-events-auto">
          <CelebrationBanner celebration={c} onDismiss={() => onDismiss(c.id)} />
        </div>
      ))}
    </div>
  );
}
