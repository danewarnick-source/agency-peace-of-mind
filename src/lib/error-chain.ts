// TEMPORARY diagnostic helper for the AWS 500s. Serializes an error and its
// full `cause` chain into a single-line JSON string so CloudWatch shows the
// real underlying error instead of the sanitized "Internal Server Error" /
// "HTTPError" wrappers h3 produces. Remove once the AWS serverFn 500s are
// root-caused and fixed.

type ErrorLink = {
  name?: string;
  message?: string;
  statusCode?: unknown;
  status?: unknown;
  stack?: string;
  keys?: string[];
};

export function serializeErrorChain(error: unknown): string {
  const chain: ErrorLink[] = [];
  let cursor: unknown = error;
  const seen = new Set<unknown>();
  while (cursor != null && !seen.has(cursor) && chain.length < 8) {
    seen.add(cursor);
    if (typeof cursor !== "object") {
      chain.push({ message: String(cursor) });
      break;
    }
    const e = cursor as Record<string, unknown>;
    chain.push({
      name: typeof e.name === "string" ? e.name : undefined,
      message: typeof e.message === "string" ? e.message : String(cursor),
      statusCode: "statusCode" in e ? e.statusCode : undefined,
      status: "status" in e ? e.status : undefined,
      stack: typeof e.stack === "string" ? e.stack.split("\n").slice(0, 12).join(" | ") : undefined,
      keys: Object.keys(e).slice(0, 12),
    });
    cursor = e.cause;
  }
  try {
    return JSON.stringify(chain);
  } catch {
    return String(error);
  }
}
