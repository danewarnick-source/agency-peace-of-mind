/**
 * Read request headers from Nitro/h3 events on both node-server (ECS/ALB)
 * and aws-lambda (Function URL). Lambda events often have `event.req` as a
 * Fetch Request and no `event.node.req`.
 *
 * Fail-closed when ALB_ORIGIN_VERIFY_SECRET is set and headers cannot be
 * read — do not skip verification just because the event shape differs.
 */

export type NitroRequestLike = {
  req?: Request | { headers?: Headers | Record<string, string | string[] | undefined> };
  node?: {
    req?: { headers?: Record<string, string | string[] | undefined> };
  };
  headers?: Headers | Record<string, string | string[] | undefined>;
};

function appendHeaderMap(
  headers: Headers,
  raw: Headers | Record<string, string | string[] | undefined> | undefined,
): void {
  if (!raw) return;
  if (typeof (raw as Headers).forEach === "function" && typeof (raw as Headers).get === "function") {
    (raw as Headers).forEach((value, key) => {
      if (value) headers.set(key, value);
    });
    return;
  }
  for (const [key, value] of Object.entries(raw as Record<string, string | string[] | undefined>)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value) && value[0]) headers.set(key, value[0]);
  }
}

export function headersFromNitroRequestEvent(event: unknown): Headers {
  const headers = new Headers();
  if (!event || typeof event !== "object") return headers;
  const e = event as NitroRequestLike;
  const req = e.req;
  if (typeof Request !== "undefined" && req instanceof Request) {
    appendHeaderMap(headers, req.headers);
  } else if (req && typeof req === "object") {
    appendHeaderMap(headers, req.headers);
  }
  appendHeaderMap(headers, e.node?.req?.headers);
  appendHeaderMap(headers, e.headers);
  return headers;
}

export function requestFromNitroEvent(event: unknown): Request {
  return new Request("http://local", { headers: headersFromNitroRequestEvent(event) });
}

export function nitroEventHasReadableHeaders(event: unknown): boolean {
  return [...headersFromNitroRequestEvent(event).keys()].length > 0;
}
