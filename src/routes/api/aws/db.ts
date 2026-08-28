import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/aws/db")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { isCognitoAuth, shouldProxyClientData } = await import("@/lib/aws/env");
          if (!shouldProxyClientData() && !isCognitoAuth()) {
            return Response.json(
              { error: { message: "AWS data path is not enabled" } },
              { status: 404 },
            );
          }
          const { resolveAnyRequestUser } = await import("@/lib/aws/resolve-user.server");
          const user = await resolveAnyRequestUser(request);
          if (!user) {
            return Response.json(
              {
                data: null,
                error: { message: "Unauthorized" },
                count: null,
                status: 401,
                statusText: "Unauthorized",
              },
              { status: 401 },
            );
          }
          let plan: unknown;
          try {
            plan = await request.json();
          } catch {
            return Response.json(
              {
                data: null,
                error: { message: "Invalid plan" },
                count: null,
                status: 400,
                statusText: "Error",
              },
              { status: 400 },
            );
          }
          if (!plan || typeof plan !== "object" || !("op" in plan)) {
            return Response.json(
              {
                data: null,
                error: { message: "Invalid plan" },
                count: null,
                status: 400,
                statusText: "Error",
              },
              { status: 400 },
            );
          }
          const { dispatchPlan } = await import("@/lib/aws/dispatch-plan.server");
          const { httpStatusForAwsDbResult, awsDbUnhandledBody } =
            await import("@/lib/aws/exec-http");
          try {
            const result = await dispatchPlan(plan as import("@/lib/aws/query-builder").DbPlan);
            return Response.json(result, { status: httpStatusForAwsDbResult(result.status) });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[aws-db] unhandled", message);
            return Response.json(awsDbUnhandledBody(message), { status: 200 });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[aws-db] route", message);
          const { awsDbUnhandledBody } = await import("@/lib/aws/exec-http");
          return Response.json(awsDbUnhandledBody(message), { status: 200 });
        }
      },
    },
  },
});
