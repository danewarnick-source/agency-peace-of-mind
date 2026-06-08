// Detects "stale chunk" / failed dynamic import errors and performs a
// one-time, loop-guarded full reload to fetch the current build.
//
// Scope is intentionally narrow: only the chunk-load error class is matched.
// All other errors fall through to the normal error boundary so real bugs
// remain visible.

const GUARD_KEY = "chunk-reload:lastAt";
const GUARD_WINDOW_MS = 10_000;

const SIGNATURES = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "dynamically imported module",
];

function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "object") {
    const anyErr = err as { message?: unknown; reason?: unknown; name?: unknown };
    if (typeof anyErr.message === "string") return String(anyErr.message);
    if (anyErr.reason) return extractMessage(anyErr.reason);
    if (typeof anyErr.name === "string") return String(anyErr.name);
  }
  try { return String(err); } catch { return ""; }
}

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: unknown })?.name;
  if (typeof name === "string" && name === "ChunkLoadError") return true;
  const msg = extractMessage(err).toLowerCase();
  if (!msg) return false;
  return SIGNATURES.some((sig) => msg.includes(sig));
}

/**
 * If `err` looks like a chunk-load error AND we have not auto-reloaded in the
 * last ~10s, trigger `location.reload()` and return true. Otherwise return
 * false (caller can render a manual-refresh prompt).
 */
export function tryAutoReloadOnce(err: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(err)) return false;
  try {
    const raw = window.sessionStorage.getItem(GUARD_KEY);
    const last = raw ? Number(raw) : 0;
    if (last && Date.now() - last < GUARD_WINDOW_MS) return false;
    window.sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — skip guard, still reload once per page.
  }
  window.location.reload();
  return true;
}

export function clearChunkReloadGuard(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(GUARD_KEY); } catch { /* noop */ }
}
