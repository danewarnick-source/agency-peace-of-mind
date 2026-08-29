/**
 * Browser S3 adapter. Talks to /api/aws/storage.
 * Server SDK usage lives in s3-storage.server.ts.
 */

import { getS3Bucket, getS3Region } from "./env";
import { readBrowserSession } from "./session-store";

export function s3ObjectKey(storageBucket: string, path: string): string {
  const clean = path.replace(/^\/+/, "");
  return `${storageBucket}/${clean}`;
}

async function blobToBytes(file: Blob | ArrayBuffer | Uint8Array | Buffer): Promise<Uint8Array> {
  if (file instanceof Uint8Array) return file;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) return new Uint8Array(file);
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (typeof Blob !== "undefined" && file instanceof Blob) {
    return new Uint8Array(await file.arrayBuffer());
  }
  throw new Error("Unsupported upload body");
}

export function createS3BucketApi(logicalBucket: string) {
  return {
    async upload(
      path: string,
      file: Blob | ArrayBuffer | Uint8Array | Buffer,
      opts?: { contentType?: string; upsert?: boolean },
    ) {
      return clientStorage("upload", logicalBucket, path, file, opts);
    },
    async download(path: string) {
      return clientStorage("download", logicalBucket, path);
    },
    async remove(paths: string[]) {
      return clientStorage("remove", logicalBucket, paths.join("\n"));
    },
    async createSignedUrl(path: string, expiresIn: number) {
      return clientStorage("signedUrl", logicalBucket, path, undefined, { expiresIn });
    },
    getPublicUrl(path: string) {
      const bucket = getS3Bucket();
      const region = getS3Region();
      if (!bucket) {
        return {
          data: {
            publicUrl: `/api/aws/storage?action=get&bucket=${encodeURIComponent(logicalBucket)}&path=${encodeURIComponent(path)}`,
          },
        };
      }
      const url = `https://${bucket}.s3.${region}.amazonaws.com/${s3ObjectKey(logicalBucket, path)}`;
      return { data: { publicUrl: url } };
    },
  };
}

export function createS3StorageAdapter() {
  return {
    from: (logicalBucket: string) => createS3BucketApi(logicalBucket),
  };
}

async function clientStorage(
  action: string,
  logicalBucket: string,
  path: string,
  file?: Blob | ArrayBuffer | Uint8Array | Buffer,
  opts?: { contentType?: string; expiresIn?: number },
) {
  const token = readBrowserSession()?.access_token;
  const qs = new URLSearchParams({
    action,
    bucket: logicalBucket,
    path,
  });
  if (opts?.expiresIn) qs.set("expiresIn", String(opts.expiresIn));
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  let body: BodyInit | undefined;
  if (action === "upload" && file) {
    const bytes = await blobToBytes(file);
    body = bytes;
    headers["content-type"] = opts?.contentType || "application/octet-stream";
  }
  if (action === "remove") {
    headers["content-type"] = "application/json";
    body = JSON.stringify({ paths: path.split("\n").filter(Boolean) });
  }
  const res = await fetch(`/api/aws/storage?${qs.toString()}`, {
    method: action === "download" || action === "signedUrl" || action === "get" ? "GET" : "POST",
    headers,
    body,
    credentials: "same-origin",
  });
  if (action === "download") {
    if (!res.ok) return { data: null, error: { message: `Download failed (${res.status})` } };
    return { data: await res.blob(), error: null };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      data: null,
      error: { message: (json as { error?: string }).error || `Storage ${action} failed` },
    };
  }
  return { data: json, error: null };
}

let _adapter: ReturnType<typeof createS3StorageAdapter> | null = null;
export function getS3StorageAdapter() {
  if (!_adapter) _adapter = createS3StorageAdapter();
  return _adapter;
}
