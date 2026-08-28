import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/aws/storage")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isS3StorageEnabled } = await import("@/lib/aws/env");
        if (!isS3StorageEnabled()) {
          return new Response("S3 is not enabled", { status: 404 });
        }
        const { resolveAnyRequestUser } = await import("@/lib/aws/resolve-user.server");
        const user = await resolveAnyRequestUser(request);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "get";
        const bucket = url.searchParams.get("bucket") || "";
        const path = url.searchParams.get("path") || "";
        if (!bucket || !path) return new Response("Missing bucket/path", { status: 400 });
        const s3 = await import("@/lib/aws/s3-storage.server");
        if (action === "signedUrl") {
          const expiresIn = Number(url.searchParams.get("expiresIn") || "60");
          const out = await s3.serverSignedUrl(bucket, path, expiresIn);
          if (out.error) return Response.json({ error: out.error.message }, { status: 400 });
          return Response.json(out.data);
        }
        if (action === "download") {
          const out = await s3.serverDownload(bucket, path);
          if (out.error || !out.data) return new Response(out.error?.message || "Not found", { status: 404 });
          return new Response(out.data, { headers: { "content-type": out.data.type || "application/octet-stream" } });
        }
        return s3.serverGetObjectResponse(bucket, path);
      },
      POST: async ({ request }) => {
        const { isS3StorageEnabled } = await import("@/lib/aws/env");
        if (!isS3StorageEnabled()) {
          return Response.json({ error: "S3 is not enabled" }, { status: 404 });
        }
        const { resolveAnyRequestUser } = await import("@/lib/aws/resolve-user.server");
        const user = await resolveAnyRequestUser(request);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "upload";
        const bucket = url.searchParams.get("bucket") || "";
        const path = url.searchParams.get("path") || "";
        const s3 = await import("@/lib/aws/s3-storage.server");
        if (action === "remove") {
          const body = (await request.json().catch(() => ({}))) as { paths?: string[] };
          const out = await s3.serverRemove(bucket, body.paths || []);
          if (out.error) return Response.json({ error: out.error.message }, { status: 400 });
          return Response.json(out.data);
        }
        if (!bucket || !path) return Response.json({ error: "Missing bucket/path" }, { status: 400 });
        const buf = new Uint8Array(await request.arrayBuffer());
        const out = await s3.serverUpload(bucket, path, buf, {
          contentType: request.headers.get("content-type") || undefined,
        });
        if (out.error) return Response.json({ error: out.error.message }, { status: 400 });
        return Response.json(out.data);
      },
    },
  },
});
