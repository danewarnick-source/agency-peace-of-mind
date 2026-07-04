// Global driver for NECTAR draft-requirement jobs. Mounted once inside the
// authenticated dashboard shell so a long extraction keeps advancing even
// when the user navigates away from the Authoritative Sources page.
//
// Responsibilities:
//   1. Poll `getActiveDraftJobs` for the current org and pick up any job
//      whose status is still `extracting` — including jobs left over from
//      a previous session or a page reload.
//   2. Drive a bounded-concurrency loop calling `processDraftChunk` per
//      unprocessed chunk index. Idempotency on the server makes overlap
//      with the background tick a no-op.
//   3. On completion, call `finalizeRequirementsDraft` and invalidate
//      dependent queries.
//   4. Publish live per-document `{ progressPct, etaMs }` into a context
//      so the source-row UI can render a real progress bar and countdown.
//   5. Nudge the server-side tick endpoint on `visibilitychange:hidden` /
//      `pagehide` so drafting keeps advancing even after the tab closes.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  finalizeRequirementsDraft,
  getActiveDraftJobs,
  nudgeDraftJob,
  processDraftChunk,
} from "@/lib/authoritative-sources.functions";

type ActiveJob = {
  jobId: string;
  documentId: string;
  documentTitle: string;
  totalChunks: number;
  processedChunks: number;
  processedIndices: number[];
  startedAt: string;
  chunkDurationsMs: number[];
};

export type DraftJobProgress = {
  jobId: string;
  documentTitle: string;
  totalChunks: number;
  processedChunks: number;
  progressPct: number;
  etaMs: number | null; // null = still measuring
  finalizing: boolean;
};

type Ctx = {
  byDocumentId: Record<string, DraftJobProgress>;
  activeCount: number;
  minEtaMs: number | null;
};

const DraftJobsContext = createContext<Ctx>({
  byDocumentId: {},
  activeCount: 0,
  minEtaMs: null,
});

const CLIENT_CONCURRENCY = 2;
const LARGE_DOC_CHUNK_THRESHOLD = 10;
const LARGE_DOC_INTER_CALL_PAUSE_MS = 1_500;
const POLL_INTERVAL_MS = 5_000;
const TRANSIENT_RETRY_PAUSE_MS = 30_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDraftError(err: unknown): boolean {
  return /rate-limit|rate limit|temporarily|still reading|retry section/i.test(
    (err as Error)?.message ?? "",
  );
}

function computeEtaMs(
  totalChunks: number,
  processedChunks: number,
  chunkDurationsMs: number[],
): number | null {
  const completed = chunkDurationsMs.length;
  const remaining = Math.max(0, totalChunks - processedChunks);
  if (remaining === 0) return 0;
  if (completed === 0) return null;
  const window = chunkDurationsMs.slice(-8);
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  const effectiveConcurrency = Math.min(CLIENT_CONCURRENCY, remaining);
  return Math.round((remaining * avg) / effectiveConcurrency);
}

export function formatEta(ms: number | null): string {
  if (ms === null) return "still measuring…";
  if (ms <= 0) return "";
  const total = Math.round(ms / 1000);
  if (total < 60) return `~${total}s left`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `~${mins}m ${secs}s left`;
}

export function DraftJobsProvider({ children }: { children: React.ReactNode }) {
  const { data: org } = useCurrentOrg();
  const orgId = (org as { organization_id?: string } | null)?.organization_id ?? null;
  const qc = useQueryClient();
  const getActive = useServerFn(getActiveDraftJobs);
  const processFn = useServerFn(processDraftChunk);
  const finalizeFn = useServerFn(finalizeRequirementsDraft);
  const nudgeFn = useServerFn(nudgeDraftJob);

  const [progress, setProgress] = useState<Record<string, DraftJobProgress>>({});
  // Track which jobIds have an in-flight driver loop so polling doesn't
  // spawn duplicates.
  const activeLoops = useRef<Set<string>>(new Set());
  // Debounce the tab-close tick nudge across jobs.
  const lastNudge = useRef<number>(0);

  const jobsQuery = useQuery({
    queryKey: ["nectar-draft-jobs", orgId],
    queryFn: async () => {
      if (!orgId) return { jobs: [] as ActiveJob[] };
      return (await getActive({ data: { organizationId: orgId } })) as {
        jobs: ActiveJob[];
      };
    },
    enabled: !!orgId,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  // Kick off / advance a driver loop for each active job.
  useEffect(() => {
    const jobs = jobsQuery.data?.jobs ?? [];
    if (jobs.length === 0) return;

    for (const job of jobs) {
      // Seed / refresh progress from the DB snapshot so the UI reflects
      // work done by the server tick even before the client loop runs.
      setProgress((prev) => ({
        ...prev,
        [job.documentId]: {
          jobId: job.jobId,
          documentTitle: job.documentTitle,
          totalChunks: job.totalChunks,
          processedChunks: job.processedChunks,
          progressPct:
            job.totalChunks > 0
              ? Math.min(
                  90,
                  Math.round((job.processedChunks / job.totalChunks) * 90),
                )
              : 0,
          etaMs: computeEtaMs(
            job.totalChunks,
            job.processedChunks,
            job.chunkDurationsMs,
          ),
          finalizing: false,
        },
      }));

      if (activeLoops.current.has(job.jobId)) continue;
      activeLoops.current.add(job.jobId);

      // Snapshot mutable state per job.
      const totals = { total: job.totalChunks };
      const doneSet = new Set<number>(job.processedIndices);
      let cursor = 0;
      let cancelled = false;
      if (doneSet.size > 0) {
        console.debug(
          `[nectar-draft] resuming job ${job.jobId} — ${doneSet.size} of ${job.totalChunks} sections already read, skipping to next`,
        );
      }
      const durations = [...job.chunkDurationsMs];

      const paced = totals.total > LARGE_DOC_CHUNK_THRESHOLD;
      let pausedUntil = 0;

      const runWorker = async () => {
        let firstCall = true;
        while (!cancelled) {
          // Find next index that isn't already done. Advance cursor past
          // any recorded index to avoid unnecessary AI calls (idempotency
          // on the server would catch it anyway but this is cheaper).
          while (cursor < totals.total && doneSet.has(cursor)) cursor += 1;
          const i = cursor;
          if (i >= totals.total) return;
          cursor += 1;

          // Pace subsequent calls in this worker on large docs so we
          // stay under the AI rate limit instead of only recovering.
          const pauseRemaining = pausedUntil - Date.now();
          if (pauseRemaining > 0) await wait(pauseRemaining);
          if (paced && !firstCall) await wait(LARGE_DOC_INTER_CALL_PAUSE_MS);
          firstCall = false;

          const t0 = Date.now();
          let processedNow = 0;
          try {
            const r = (await processFn({
              data: { jobId: job.jobId, chunkIndex: i },
            })) as {
              processed: number;
              total: number;
              itemsAdded: number;
              skipped: boolean;
              transient?: boolean;
              retryAfterMs?: number;
            };
            if (r.transient) {
              // Server hit a rate limit on this section — don't mark it done.
              // Rewind cursor so this worker retries it after a pause.
              const retryAfterMs = Math.max(
                5_000,
                Math.min(120_000, r.retryAfterMs ?? TRANSIENT_RETRY_PAUSE_MS),
              );
              pausedUntil = Math.max(pausedUntil, Date.now() + retryAfterMs);
              cursor = Math.min(cursor, i);
              setProgress((prev) => {
                const cur = prev[job.documentId];
                if (!cur) return prev;
                return {
                  ...prev,
                  [job.documentId]: { ...cur, etaMs: retryAfterMs },
                };
              });
              await wait(retryAfterMs);
              continue;
            }
            processedNow = r.processed;
            doneSet.add(i);
            if (!r.skipped) durations.push(Math.max(1, Date.now() - t0));
          } catch (err) {
            if (isTransientDraftError(err)) {
              console.info(
                `[nectar-draft] section ${i} is waiting for AI capacity for job ${job.jobId}:`,
                (err as Error).message,
              );
              pausedUntil = Math.max(pausedUntil, Date.now() + TRANSIENT_RETRY_PAUSE_MS);
              cursor = Math.min(cursor, i);
              setProgress((prev) => {
                const cur = prev[job.documentId];
                if (!cur) return prev;
                return {
                  ...prev,
                  [job.documentId]: {
                    ...cur,
                    etaMs: TRANSIENT_RETRY_PAUSE_MS,
                  },
                };
              });
              await wait(TRANSIENT_RETRY_PAUSE_MS);
              continue;
            }
            // Log but keep going with other chunks — the server records
            // per-chunk failures in chunk_failures and finalize surfaces
            // them to the user.
            console.warn(
              `[nectar-draft] chunk ${i} failed for job ${job.jobId}:`,
              (err as Error).message,
            );
            doneSet.add(i); // avoid infinite retry within the same session
          }

          setProgress((prev) => {
            const cur = prev[job.documentId];
            if (!cur) return prev;
            const nextProcessed = Math.max(cur.processedChunks, processedNow || doneSet.size);
            return {
              ...prev,
              [job.documentId]: {
                ...cur,
                processedChunks: nextProcessed,
                progressPct:
                  totals.total > 0
                    ? Math.min(
                        90,
                        Math.round((nextProcessed / totals.total) * 90),
                      )
                    : 0,
                etaMs: computeEtaMs(totals.total, nextProcessed, durations),
              },
            };
          });
        }
      };

      (async () => {
        try {
          await Promise.all(
            Array.from(
              { length: Math.min(CLIENT_CONCURRENCY, Math.max(1, totals.total - doneSet.size)) },
              () => runWorker(),
            ),
          );

          setProgress((prev) =>
            prev[job.documentId]
              ? {
                  ...prev,
                  [job.documentId]: {
                    ...prev[job.documentId],
                    progressPct: 95,
                    finalizing: true,
                    etaMs: null,
                  },
                }
              : prev,
          );

          const finalize = (await finalizeFn({
            data: { jobId: job.jobId },
          })) as {
            inserted?: number;
            message?: string;
            reason?: string;
          };

          const inserted = finalize.inserted ?? 0;
          if (inserted > 0) {
            toast.success(
              `NECTAR drafted ${inserted} requirement${inserted === 1 ? "" : "s"} from “${job.documentTitle}”. Review them in the Requirements tab.`,
            );
          } else if (finalize.message) {
            toast.warning(finalize.message, { duration: 9000 });
          }

          if (orgId) {
            qc.invalidateQueries({ queryKey: ["requirements", orgId] });
            qc.invalidateQueries({ queryKey: ["auth-sources", orgId] });
          }
        } catch (err) {
          if (isTransientDraftError(err)) {
            toast.info(
              `NECTAR is waiting for AI capacity, then will continue reading “${job.documentTitle}”.`,
              { duration: 7000 },
            );
          } else {
            toast.error(
              `Drafting “${job.documentTitle}” failed: ${(err as Error).message}`,
            );
          }
        } finally {
          cancelled = true;
          activeLoops.current.delete(job.jobId);
          setProgress((prev) => {
            const { [job.documentId]: _drop, ...rest } = prev;
            void _drop;
            return rest;
          });
          qc.invalidateQueries({ queryKey: ["nectar-draft-jobs", orgId] });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsQuery.data?.jobs.map((j) => j.jobId).join("|"), orgId]);

  // On tab hide / pagehide, POST the tick endpoint for each active job so
  // the server keeps chunking. Best-effort — the browser may cancel the
  // fetch, but sendBeacon / keepalive usually survives.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nudge = () => {
      const jobs = jobsQuery.data?.jobs ?? [];
      if (jobs.length === 0) return;
      const now = Date.now();
      if (now - lastNudge.current < 1_000) return;
      lastNudge.current = now;
      // Fire authenticated server-fn nudges so the server-side tick keeps
      // chunking after the tab is hidden or closed. Best-effort — the
      // browser may cancel some requests on pagehide, but any completed
      // request will run runDraftTick up to its 45s budget. Idempotency
      // in processDraftChunk makes overlap with the client driver safe.
      for (const j of jobs) {
        void nudgeFn({ data: { jobId: j.jobId } }).catch(() => undefined);
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") nudge();
    };
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", nudge);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", nudge);
    };
  }, [jobsQuery.data?.jobs]);

  const ctx: Ctx = useMemo(() => {
    const values = Object.values(progress);
    const etas = values
      .map((v) => v.etaMs)
      .filter((v): v is number => typeof v === "number" && v > 0);
    return {
      byDocumentId: progress,
      activeCount: values.length,
      minEtaMs: etas.length > 0 ? Math.min(...etas) : null,
    };
  }, [progress]);

  return (
    <DraftJobsContext.Provider value={ctx}>
      {children}
    </DraftJobsContext.Provider>
  );
}

export function useDraftJobProgress(documentId: string): DraftJobProgress | null {
  const ctx = useContext(DraftJobsContext);
  return ctx.byDocumentId[documentId] ?? null;
}

export function useDraftJobsSummary(): { activeCount: number; minEtaMs: number | null } {
  const ctx = useContext(DraftJobsContext);
  return { activeCount: ctx.activeCount, minEtaMs: ctx.minEtaMs };
}
