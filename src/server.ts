import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { serializeErrorChain } from "./lib/error-chain";
import { renderErrorPage } from "./lib/error-page";
import {
  isCatastrophicSsrErrorBody,
  shouldHtmlRewriteCatastrophic500,
} from "./lib/catastrophic-ssr";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function json500(message: string): Response {
  return Response.json({ status: 500, unhandled: true, message }, { status: 500 });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
// Live ECS: rewriting those as HTML hung dashboard Loading because serverFn
// RPCs got an HTML page instead of JSON. Only GET documents may be rewritten.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (response.status < 500) return response;

  const method = request.method;
  const url = request.url;
  const accept = request.headers.get("accept") ?? "";
  const rewrite = shouldHtmlRewriteCatastrophic500({ method, acceptHeader: accept });
  const contentType = response.headers.get("content-type") ?? "";

  // Live probe: POST /_serverFn with Accept: application/json was still
  // returning branded HTML because an inner layer had already rewritten.
  // POST/JSON clients must never leave with text/html 500s.
  if (!rewrite && contentType.includes("text/html")) {
    const captured = consumeLastCapturedError();
    console.error(
      `[server.ts] stripped HTML 500 method=${method} url=${url} accept=${accept} captured=${
        captured !== undefined ? serializeErrorChain(captured) : "none"
      }`,
    );
    return json500("HTTPError");
  }

  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  const captured = consumeLastCapturedError();
  console.error(
    `[server.ts] h3 swallowed error method=${method} url=${url} accept=${accept} rewritten=${rewrite} body=${body} captured=${
      captured !== undefined ? serializeErrorChain(captured) : "none"
    }`,
  );
  if (!rewrite) return response;
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      const method = request.method;
      const url = request.url;
      const accept = request.headers.get("accept") ?? "";
      console.error(
        `[server.ts] fetch threw method=${method} url=${url} accept=${accept} chain=${serializeErrorChain(error)}`,
      );
      if (shouldHtmlRewriteCatastrophic500({ method, acceptHeader: accept })) {
        return brandedErrorResponse();
      }
      return json500(error instanceof Error ? error.message : "HTTPError");
    }
  },
};
