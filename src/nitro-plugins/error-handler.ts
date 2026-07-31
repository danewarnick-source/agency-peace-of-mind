// TEMPORARY: custom Nitro error handler for AWS ECS debugging.
// Replaces the default virtual error handler so we can log the full cause
// chain in a single line before CloudWatch collapses the multi-line stack.
// Remove once the server function 500s are root-caused.
import { toResponse } from "h3";

type AnyError = {
  message?: string;
  name?: string;
  status?: number;
  statusCode?: number;
  stack?: string;
  cause?: unknown;
  unhandled?: boolean;
};

function summarize(err: unknown, depth = 0): string {
  if (depth > 5 || err == null) return String(err);
  if (typeof err !== "object") return String(err);
  const e = err as AnyError;
  const top = `[${e.name ?? "Error"}] ${e.message ?? "?"} (status=${e.statusCode ?? e.status ?? "?"}) stack=${(e.stack ?? "").split("\n").slice(1, 6).join(" > ")}`;
  if (e.cause) return `${top} |cause| ${summarize(e.cause, depth + 1)}`;
  return top;
}

export default function errorHandler(error: unknown, event: unknown) {
  const e = error as AnyError;
  if (e?.status !== 404 && e?.statusCode !== 404) {
    console.error(`[nitro:errorHandler] ${summarize(error)}`);
  }
  return toResponse(error, event as Parameters<typeof toResponse>[1]);
}
