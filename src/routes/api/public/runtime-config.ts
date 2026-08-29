import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/runtime-config")({
  server: {
    handlers: {
      GET: async () => {
        const { getPublicRuntimeBlob } = await import("@/lib/aws/env");
        return Response.json(getPublicRuntimeBlob(), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
