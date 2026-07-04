// Server-only helpers for the background NECTAR draft-tick loop.
// Loaded lazily from server functions and the public API route so it never
// ends up in the client bundle.
import { getRequest } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { extractChunkWithRetry, isTransientAIError } from "./authoritative-sources.server";

const TICK_PATH = "/api/public/hooks/nectar-draft-tick";
// Wall-clock budget per tick invocation. AI calls are I/O so this stays
// well under the Cloudflare Workers CPU cap; the loop stops early if it
// runs out of time and the next tick (or the client driver) picks up.
const TICK_BUDGET_MS = 45_000;
// Pace AI calls for large documents to avoid tripping the rate limit
// proactively (instead of just recovering from it). Small docs (<= threshold)
// run at concurrency 2 with no inter-call pause. Large docs run at
// concurrency 2 with a short pause between calls per worker.
const TICK_CONCURRENCY = 2;
const LARGE_DOC_CHUNK_THRESHOLD = 10;
const LARGE_DOC_INTER_CALL_PAUSE_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function tickSecret(): string {
  const secret = process.env.NECTAR_DRAFT_TICK_SECRET;
  if (!secret) throw new Error("NECTAR_DRAFT_TICK_SECRET not configured");
  return secret;
}

export function signDraftTickBody(rawBody: string): string {
  return createHmac("sha256", tickSecret()).update(rawBody).digest("hex");
}

export function verifyDraftTickSignature(
  rawBody: string,
  provided: string | null | undefined,
): boolean {
  if (!provided) return false;
  const expected = signDraftTickBody(rawBody);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function currentOrigin(): string {
  const req = getRequest();
  const forwardedHost = req?.headers?.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = req?.headers?.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  const host = req?.headers?.get("host");
  if (host) {
    const proto = req?.headers?.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  try {
    return new URL(req?.url ?? "").origin;
  } catch {
    return "";
  }
}

/**
 * POST the tick endpoint for a job. Best-effort background nudge: sent
 * fire-and-forget with `keepalive`. The client driver is the authoritative
 * progress mechanism; the tick is a bonus for tab-closed / offline cases.
 */
export async function fireDraftTick(
  jobId: string,
  opts: { wait?: boolean } = {},
): Promise<void> {
  const origin = currentOrigin();
  if (!origin) return;
  const body = JSON.stringify({ jobId });
  const signature = signDraftTickBody(body);
  const url = `${origin}${TICK_PATH}`;
  const promise = fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nectar-draft-signature": signature,
    },
    body,
    keepalive: true,
  }).catch(() => undefined);
  if (opts.wait) await promise;
}

// ---------- The actual tick loop ----------

type DraftItem = {
  title: string;
  description?: string | null;
  category?: "audit_doc" | "obligation" | "rule" | "billing" | null;
  citation?: string | null;
  applies_to?: "company" | "staff" | "client" | null;
};

type JobRow = {
  id: string;
  document_id: string;
  status: string;
  total_chunks: number;
  processed_chunks: number;
  processed_indices: number[];
  chunk_ranges: Array<[number, number]>;
  extracted_items: DraftItem[];
  chunk_failures: string[];
  chunk_durations_ms: number[];
};

async function loadJob(jobId: string): Promise<JobRow | null> {
  const { data, error } = await supabaseAdmin
    .from("nectar_draft_jobs")
    .select(
      "id, document_id, status, total_chunks, processed_chunks, processed_indices, chunk_ranges, extracted_items, chunk_failures, chunk_durations_ms",
    )
    .eq("id", jobId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id as string,
    document_id: data.document_id as string,
    status: data.status as string,
    total_chunks: (data.total_chunks as number) ?? 0,
    processed_chunks: (data.processed_chunks as number) ?? 0,
    processed_indices: ((data.processed_indices as number[] | null) ?? []) as number[],
    chunk_ranges: ((data.chunk_ranges as unknown as Array<[number, number]>) ?? []),
    extracted_items: ((data.extracted_items as unknown as DraftItem[]) ?? []),
    chunk_failures: ((data.chunk_failures as unknown as string[]) ?? []),
    chunk_durations_ms: ((data.chunk_durations_ms as number[] | null) ?? []) as number[],
  };
}

async function loadRawText(documentId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("nectar_documents")
    .select("raw_text")
    .eq("id", documentId)
    .single();
  return ((data?.raw_text as string | null) ?? "").trim();
}

async function processOneChunk(
  jobId: string,
  chunkIndex: number,
  windowText: string,
  totalChunks: number,
): Promise<{ items: DraftItem[]; failures: string[]; durationMs: number; transient: boolean }> {
  const t0 = Date.now();
  let items: DraftItem[] = [];
  let failures: string[] = [];
  try {
    const got = await extractChunkWithRetry(
      windowText,
      `PART ${chunkIndex + 1} OF ${totalChunks}`,
    );
    items = got.items;
    failures = got.failures;
  } catch (err) {
    if (isTransientAIError(err)) {
      return { items: [], failures: [], durationMs: Math.max(1, Date.now() - t0), transient: true };
    }
    failures = [
      `PART ${chunkIndex + 1}: ${(err as Error).message.slice(0, 300)}`,
    ];
  }
  const durationMs = Math.max(1, Date.now() - t0);
  void jobId;
  return { items, failures, durationMs, transient: false };
}

async function persistChunkResult(
  jobId: string,
  chunkIndex: number,
  result: { items: DraftItem[]; failures: string[]; durationMs: number; transient?: boolean },
): Promise<void> {
  if (result.transient) return;
  // Re-read the row so we merge against the freshest state — the client
  // driver may have written to the same row between our fetch and update.
  const job = await loadJob(jobId);
  if (!job) return;
  if (job.processed_indices.includes(chunkIndex)) return; // already recorded

  await supabaseAdmin
    .from("nectar_draft_jobs")
    .update({
      processed_chunks: job.processed_chunks + 1,
      processed_indices: [...job.processed_indices, chunkIndex],
      chunk_durations_ms: [...job.chunk_durations_ms, result.durationMs],
      extracted_items: [
        ...job.extracted_items,
        ...result.items,
      ] as unknown as Json,
      chunk_failures: [
        ...job.chunk_failures,
        ...result.failures,
      ] as unknown as Json,
    })
    .eq("id", jobId);
}

/**
 * Process as many unprocessed chunks as fit into the wall-clock budget for
 * this invocation. Concurrency-bounded so we don't spike the AI gateway.
 * Returns counters so the caller can report progress.
 */
export async function runDraftTick(jobId: string): Promise<{
  processed: number;
  total: number;
  status: string;
  chunksThisTick: number;
}> {
  const startedAt = Date.now();
  const initial = await loadJob(jobId);
  if (!initial) return { processed: 0, total: 0, status: "not_found", chunksThisTick: 0 };
  if (initial.status !== "extracting")
    return {
      processed: initial.processed_chunks,
      total: initial.total_chunks,
      status: initial.status,
      chunksThisTick: 0,
    };

  const rawText = await loadRawText(initial.document_id);
  const total = initial.total_chunks;
  const done = new Set<number>(initial.processed_indices);
  const remaining: number[] = [];
  for (let i = 0; i < total; i += 1) if (!done.has(i)) remaining.push(i);
  if (remaining.length === 0)
    return {
      processed: initial.processed_chunks,
      total,
      status: initial.status,
      chunksThisTick: 0,
    };

  let cursor = 0;
  let chunksThisTick = 0;
  const paced = total > LARGE_DOC_CHUNK_THRESHOLD;

  const worker = async () => {
    let firstCall = true;
    while (true) {
      if (Date.now() - startedAt > TICK_BUDGET_MS) return;
      const i = cursor++;
      if (i >= remaining.length) return;
      const chunkIndex = remaining[i];
      // Skip if another driver already claimed it since we loaded.
      const fresh = await loadJob(jobId);
      if (!fresh || fresh.status !== "extracting") return;
      if (fresh.processed_indices.includes(chunkIndex)) continue;

      // Pace subsequent AI calls in this worker to stay under rate limits.
      if (paced && !firstCall) await sleep(LARGE_DOC_INTER_CALL_PAUSE_MS);
      firstCall = false;

      const [s, e] = initial.chunk_ranges[chunkIndex];
      const windowText = rawText.slice(s, e);
      const result = await processOneChunk(jobId, chunkIndex, windowText, total);
      if (result.transient) return;
      await persistChunkResult(jobId, chunkIndex, result);
      chunksThisTick += 1;
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(TICK_CONCURRENCY, remaining.length) },
      () => worker(),
    ),
  );

  const after = await loadJob(jobId);
  return {
    processed: after?.processed_chunks ?? initial.processed_chunks,
    total,
    status: after?.status ?? initial.status,
    chunksThisTick,
  };
}
