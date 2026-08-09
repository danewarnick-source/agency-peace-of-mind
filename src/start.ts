import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { serializeErrorChain } from "./lib/error-chain";
import { attachSupabaseAuth } from "@/lib/attach-supabase-auth";

const errorMiddleware = createMiddleware().server(async (ctx) => {
  const { next, request, pathname, serverFnMeta } = ctx as unknown as {
    next: () => Promise<Response>; request?: Request; pathname?: string; serverFnMeta?: unknown;
  };
  // handlerType is present at runtime but absent from the published middleware types.
  const handlerType = (ctx as Record<string, unknown>)["handlerType"] as string | undefined;
  return await (async () => {
  try {
    return await next();
  } catch (error) {
    // TEMPORARY: full-detail structured log (method, path, handler type,
    // complete cause chain with stacks) — h3/nitro sanitizes everything
    // downstream to a generic "Internal Server Error", so this line in
    // CloudWatch is the only place the real error appears. handlerType
    // tells us whether Start recognized the request as a serverFn call or
    // misrouted it into the page router. Remove once the AWS serverFn
    // 500s are root-caused.
    console.error(
      `[errorMiddleware] ${request?.method ?? "?"} ${pathname ?? "?"} handlerType=${handlerType ?? "?"} serverFn=${serverFnMeta ? JSON.stringify(serverFnMeta) : "none"} chain=${serializeErrorChain(error)}`,
    );
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
