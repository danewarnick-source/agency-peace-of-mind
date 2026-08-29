import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { serializeErrorChain } from "./lib/error-chain";
import { captureError } from "./lib/error-capture";
import { shouldHtmlRewriteCatastrophic500 } from "./lib/catastrophic-ssr";
import { attachSupabaseAuth } from "@/lib/attach-supabase-auth";

const errorMiddleware = createMiddleware().server(async (ctx) => {
  const { next, request, pathname, serverFnMeta } = ctx;
  // handlerType exists at runtime but is missing from the published types.
  const handlerType = (ctx as unknown as Record<string, unknown>)["handlerType"];
  try {
    return await next();
  } catch (error) {
    captureError(error);
    const method = request?.method ?? "?";
    const url = request?.url ?? pathname ?? "?";
    const accept = request?.headers?.get("accept") ?? "";
    // TEMPORARY: full-detail structured log. h3/nitro sanitizes the throw;
    // this line is how we learn which serverFn/path the ECS 500s hit.
    console.error(
      `[errorMiddleware] method=${method} url=${url} accept=${accept} pathname=${pathname ?? "?"} handlerType=${String(handlerType ?? "?")} serverFn=${serverFnMeta ? JSON.stringify(serverFnMeta) : "none"} chain=${serializeErrorChain(error)}`,
    );
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    if (shouldHtmlRewriteCatastrophic500({ method, acceptHeader: accept })) {
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const message = error instanceof Error ? error.message : "HTTPError";
    return Response.json({ status: 500, unhandled: true, message }, { status: 500 });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
