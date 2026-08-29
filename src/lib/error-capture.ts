// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

export function captureError(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

function record(error: unknown) {
  captureError(error);
}

// Cloudflare Workers runtime dispatches uncaught errors/rejections through
// globalThis's WHATWG EventTarget.
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

// Node.js (AWS Lambda) never fires those globalThis events for uncaught
// exceptions/rejections — it uses process-level events instead. Without
// this, every SSR error on Lambda was silently lost before reaching
// consumeLastCapturedError(), leaving only the generic "h3 swallowed SSR
// error" placeholder with no way to see the real stack trace.
declare const process:
  | { on?: (event: string, listener: (...args: unknown[]) => void) => void }
  | undefined;
if (typeof process !== "undefined" && typeof process?.on === "function") {
  process.on("uncaughtException", (err: unknown) => record(err));
  process.on("unhandledRejection", (reason: unknown) => record(reason));
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
