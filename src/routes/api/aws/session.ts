import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/aws/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isCognitoAuth } = await import("@/lib/aws/env");
        if (!isCognitoAuth()) {
          return Response.json({ error: "Cognito is not enabled" }, { status: 404 });
        }
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          email?: string;
          identifier?: string;
          password?: string;
          refresh_token?: string;
        };
        const action = body.action || "signin";
        const login = await import("@/lib/login.server");
        try {
          if (action === "signin") {
            const identifier = (body.identifier || body.email || "").trim();
            const result = await login.performPasswordSignIn(identifier, body.password || "");
            return Response.json(result);
          }
          if (action === "signout") {
            await login.performAwsSignOut();
            return Response.json({ ok: true });
          }
          if (action === "refresh") {
            const result = await login.performAwsRefresh(body.refresh_token || "");
            return Response.json(result);
          }
          if (action === "forgot") {
            await login.performAwsForgotPassword(body.email || "");
            return Response.json({ ok: true });
          }
          if (action === "updatePassword") {
            await login.performAwsUpdatePassword(body.password || "");
            return Response.json({ ok: true });
          }
          return Response.json({ error: "Unknown action" }, { status: 400 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Request failed";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
