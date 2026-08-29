/**
 * h3 turns in-handler throws into {"unhandled":true,"message":"HTTPError"} JSON 500s.
 * Live ECS then rewrote those as branded HTML in server.ts, which hung
 * TanStack serverFn clients (JSON parse of an HTML page) on Loading….
 */

export function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

/**
 * Branded HTML is only for GET document navigations. POST / serverFn / JSON
 * clients must keep the JSON 500 so they can recover instead of spinning.
 */
export function shouldHtmlRewriteCatastrophic500(opts: {
  method: string;
  acceptHeader: string;
}): boolean {
  const method = (opts.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  const accept = (opts.acceptHeader || "").toLowerCase();
  if (!accept.includes("text/html")) return false;
  const jsonPos = accept.indexOf("application/json");
  if (jsonPos === -1) return true;
  const htmlPos = accept.indexOf("text/html");
  // application/json preferred (appears first) — keep JSON.
  return htmlPos !== -1 && htmlPos < jsonPos;
}
