import { createFileRoute } from "@tanstack/react-router";
import { seedMockStaff } from "@/lib/seed.functions";

export const Route = createFileRoute("/api/public/seed-staff")({
  server: {
    handlers: {
      POST: async () => {
        const result = await seedMockStaff({});
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
