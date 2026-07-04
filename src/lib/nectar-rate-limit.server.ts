// Server-only rate-limit helper for NECTAR Bedrock calls.
// Backed by public.nectar_rate_state so all workers (server tick, client-driver
// requests, other server fns) share a single sliding-window counter.
//
// Bedrock quotas (Claude Sonnet 4.5/4.6 on cross-region + global cross-region):
// - 10 requests / minute (not adjustable at our tier)
// - 6,000,000 tokens / minute (fine; we won't approach this)
// - 5,400,000 invocation tokens / day (this is the real ceiling)
//
// We target 80% of RPM to leave headroom for retries and other NECTAR features.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public knobs — kept as consts so callers can share the exact same key.
export const BEDROCK_RATE_KEY = "bedrock:sonnet";
export const BEDROCK_MAX_PER_MIN = 8;                // 80% of 10 rpm
export const BEDROCK_DAILY_TOKEN_CAP = 5_000_000;    // ~93% of 5.4M/day
const ACQUIRE_MAX_WAIT_MS = 60_000;                   // give up if bucket stays full this long
const ACQUIRE_POLL_CAP_MS = 8_000;                    // never sleep longer than this at once

export class RateLimitError extends Error {
  waitMs: number;
  dayFull: boolean;
  constructor(msg: string, waitMs: number, dayFull: boolean) {
    super(msg);
    this.name = "RateLimitError";
    this.waitMs = waitMs;
    this.dayFull = dayFull;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Block until the shared bucket grants a slot, or throw RateLimitError if the
 * caller would have to wait longer than ACQUIRE_MAX_WAIT_MS. Safe to call from
 * multiple parallel workers — Postgres row lock in the RPC serializes access.
 */
export async function acquireBedrockSlot(): Promise<{ dayTokensUsed: number }> {
  const started = Date.now();
  let lastDayTokens = 0;
  while (true) {
    const { data, error } = await supabaseAdmin.rpc("nectar_check_rate", {
      p_key: BEDROCK_RATE_KEY,
      p_max_per_min: BEDROCK_MAX_PER_MIN,
      p_daily_token_cap: BEDROCK_DAILY_TOKEN_CAP,
    });
    if (error) {
      // Never let a bookkeeping failure block real work — log and let the caller
      // proceed. The AWS quota will still enforce itself with a 429 if we're
      // actually over.
      console.warn("[nectar-rate] check_rate failed:", error.message);
      return { dayTokensUsed: lastDayTokens };
    }
    const row = Array.isArray(data) ? data[0] : data;
    const waitMs = Number(row?.wait_ms ?? 0);
    lastDayTokens = Number(row?.day_tokens_used ?? 0);
    const dayFull = Boolean(row?.day_full);

    if (waitMs === 0) return { dayTokensUsed: lastDayTokens };

    if (dayFull) {
      throw new RateLimitError(
        "Bedrock daily token budget exhausted. Resets at 00:00 UTC.",
        waitMs,
        true,
      );
    }

    const elapsed = Date.now() - started;
    if (elapsed + waitMs > ACQUIRE_MAX_WAIT_MS) {
      throw new RateLimitError(
        `Bedrock rate limit: still waiting after ${Math.round(elapsed / 1000)}s.`,
        waitMs,
        false,
      );
    }
    await sleep(Math.min(waitMs, ACQUIRE_POLL_CAP_MS));
  }
}

/** Best-effort: add tokens consumed by a completed Bedrock call to the daily bucket. */
export async function recordBedrockTokens(tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const { error } = await supabaseAdmin.rpc("nectar_record_tokens", {
    p_key: BEDROCK_RATE_KEY,
    p_tokens: Math.round(tokens),
  });
  if (error) console.warn("[nectar-rate] record_tokens failed:", error.message);
}
