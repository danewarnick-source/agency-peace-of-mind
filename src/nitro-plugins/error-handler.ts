// TEMPORARY: custom Nitro error handler for AWS ECS debugging.
// Replaces the default virtual error handler so we can log the full cause
// chain in a single line before CloudWatch collapses the multi-line stack.
// Remove once the server function 500s are root-caused.
import { toResponse } from "h3";
import { captureError } from "../lib/error-capture";
import { serializeErrorChain } from "../lib/error-chain";

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

function eventRequestMeta(event: unknown): { method: string; url: string; accept: string } {
  if (!event || typeof event !== "object") {
    return { method: "?", url: "?", accept: "" };
  }
  const e = event as {
    method?: string;
    path?: string;
    url?: string | URL;
    req?: Request | { method?: string; url?: string; headers?: Headers | Record<string, string> };
    node?: {
      req?: {
        method?: string;
        url?: string;
        headers?: Record<string, string | string[] | undefined>;
      };
    };
  };
  const req = e.req;
  const nodeReq = e.node?.req;
  const method =
    (typeof Request !== "undefined" && req instanceof Request
      ? req.method
      : (req as { method?: string } | undefined)?.method) ||
    nodeReq?.method ||
    e.method ||
    "?";
  let url = "?";
  if (typeof e.path === "string" && e.path) url = e.path;
  else if (typeof e.url === "string" && e.url) url = e.url;
  else if (e.url && typeof e.url === "object" && "href" in e.url) url = String((e.url as URL).href);
  else if (typeof Request !== "undefined" && req instanceof Request) url = req.url;
  else if (req && typeof req === "object" && "url" in req && typeof req.url === "string")
    url = req.url;
  else if (nodeReq?.url) url = nodeReq.url;

  let accept = "";
  if (typeof Request !== "undefined" && req instanceof Request) {
    accept = req.headers.get("accept") ?? "";
  } else if (
    req &&
    typeof req === "object" &&
    req.headers &&
    typeof (req.headers as Headers).get === "function"
  ) {
    accept = (req.headers as Headers).get("accept") ?? "";
  } else if (nodeReq?.headers) {
    const raw = nodeReq.headers.accept;
    accept = Array.isArray(raw) ? raw.join(",") : String(raw ?? "");
  }
  return { method, url, accept };
}

export default function errorHandler(error: unknown, event: unknown) {
  captureError(error);
  const { method, url, accept } = eventRequestMeta(event);
  const e = error as AnyError;
  if (e?.status !== 404 && e?.statusCode !== 404) {
    console.error(
      `[nitro:errorHandler] method=${method} url=${url} accept=${accept} ${summarize(error)} chain=${serializeErrorChain(error)}`,
    );
  }
  return toResponse(error, event as Parameters<typeof toResponse>[1]);
}
