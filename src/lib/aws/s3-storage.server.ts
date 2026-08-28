import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Bucket, getS3Region } from "./env";
import { s3ObjectKey } from "./s3-storage";

let _s3: S3Client | null = null;

function s3(): S3Client {
  if (!_s3) _s3 = new S3Client({ region: getS3Region() });
  return _s3;
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

export async function serverUpload(
  logicalBucket: string,
  path: string,
  file: Blob | ArrayBuffer | Uint8Array | Buffer,
  opts?: { contentType?: string },
) {
  const bucket = getS3Bucket();
  if (!bucket) return { data: null, error: { message: "S3_BUCKET is not set" } };
  try {
    const body = await blobToBytes(file);
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3ObjectKey(logicalBucket, path),
        Body: body,
        ContentType: opts?.contentType,
      }),
    );
    return { data: { path }, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Upload failed" } };
  }
}

export async function serverDownload(logicalBucket: string, path: string) {
  const bucket = getS3Bucket();
  if (!bucket) return { data: null, error: { message: "S3_BUCKET is not set" } };
  try {
    const out = await s3().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3ObjectKey(logicalBucket, path),
      }),
    );
    const bytes = out.Body
      ? new Uint8Array(await out.Body.transformToByteArray())
      : new Uint8Array();
    const blob = new Blob([bytes], { type: out.ContentType || "application/octet-stream" });
    return { data: blob, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Download failed" },
    };
  }
}

export async function serverRemove(logicalBucket: string, paths: string[]) {
  const bucket = getS3Bucket();
  if (!bucket) return { data: null, error: { message: "S3_BUCKET is not set" } };
  try {
    const objects = paths.map((p) => ({ Key: s3ObjectKey(logicalBucket, p) }));
    if (objects.length === 0) return { data: [], error: null };
    await s3().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
    return { data: paths, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Delete failed" } };
  }
}

export async function serverSignedUrl(logicalBucket: string, path: string, expiresIn: number) {
  const bucket = getS3Bucket();
  if (!bucket) return { data: null, error: { message: "S3_BUCKET is not set" } };
  try {
    const url = await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: bucket, Key: s3ObjectKey(logicalBucket, path) }),
      { expiresIn: expiresIn || 60 },
    );
    return { data: { signedUrl: url }, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Sign failed" } };
  }
}

export async function serverGetObjectResponse(
  logicalBucket: string,
  path: string,
): Promise<Response> {
  const bucket = getS3Bucket();
  if (!bucket) return new Response("S3_BUCKET is not set", { status: 500 });
  try {
    const out = await s3().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3ObjectKey(logicalBucket, path),
      }),
    );
    const bytes = out.Body ? await out.Body.transformToByteArray() : new Uint8Array();
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": out.ContentType || "application/octet-stream",
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Download failed", { status: 404 });
  }
}

export function getS3StorageAdapter() {
  return {
    from: (logicalBucket: string) => ({
      upload: (
        path: string,
        file: Blob | ArrayBuffer | Uint8Array | Buffer,
        opts?: { contentType?: string },
      ) => serverUpload(logicalBucket, path, file, opts),
      download: (path: string) => serverDownload(logicalBucket, path),
      remove: (paths: string[]) => serverRemove(logicalBucket, paths),
      createSignedUrl: (path: string, expiresIn: number) =>
        serverSignedUrl(logicalBucket, path, expiresIn),
      getPublicUrl: (path: string) => {
        const bucket = getS3Bucket();
        const region = getS3Region();
        if (!bucket) {
          return {
            data: {
              publicUrl: `/api/aws/storage?action=get&bucket=${encodeURIComponent(logicalBucket)}&path=${encodeURIComponent(path)}`,
            },
          };
        }
        return {
          data: {
            publicUrl: `https://${bucket}.s3.${region}.amazonaws.com/${s3ObjectKey(logicalBucket, path)}`,
          },
        };
      },
    }),
  };
}
