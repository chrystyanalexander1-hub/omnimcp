import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./google-auth.js";

const STORAGE_API = "https://storage.googleapis.com/storage/v1";
const STORAGE_UPLOAD_API = "https://storage.googleapis.com/upload/storage/v1";

export class GcsApiError extends Error {}

const listObjectsSchema = z.object({ bucket: z.string(), prefix: z.string().optional() });
const uploadObjectSchema = z.object({
  bucket: z.string(),
  name: z.string(),
  contentBase64: z.string(),
  contentType: z.string().default("application/octet-stream"),
});
const downloadObjectSchema = z.object({ bucket: z.string(), name: z.string() });
const deleteObjectSchema = z.object({ bucket: z.string(), name: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof GcsApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new GcsApiError(json.error?.message ?? `Google Cloud Storage API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "google-cloud-storage",
  version: "0.1.0",
  tools: [
    {
      name: "list_objects",
      description: "List objects in a bucket.",
      inputSchema: listObjectsSchema,
      async handler({ bucket, prefix }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const url = new URL(`${STORAGE_API}/b/${bucket}/o`);
          if (prefix) url.searchParams.set("prefix", prefix);
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          return handle<{ items?: unknown[] }>(res);
        });
        return result.ok ? jsonResult(result.value.items ?? []) : errorResult(result.message);
      },
    },
    {
      name: "upload_object",
      description: "Upload an object to a bucket.",
      inputSchema: uploadObjectSchema,
      async handler({ bucket, name, contentBase64, contentType }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const bytes = Buffer.from(contentBase64, "base64");
          const url = new URL(`${STORAGE_UPLOAD_API}/b/${bucket}/o`);
          url.searchParams.set("uploadType", "media");
          url.searchParams.set("name", name);
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
            body: bytes,
          });
          return handle(res);
        });
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "download_object",
      description: "Download an object's content as base64.",
      inputSchema: downloadObjectSchema,
      async handler({ bucket, name }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const url = `${STORAGE_API}/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new GcsApiError(`Google Cloud Storage API error: HTTP ${res.status}`);
          const buffer = Buffer.from(await res.arrayBuffer());
          return { contentBase64: buffer.toString("base64"), byteLength: buffer.length };
        });
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "delete_object",
      description: "Permanently delete an object from a bucket.",
      inputSchema: deleteObjectSchema,
      async handler({ bucket, name }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(`${STORAGE_API}/b/${bucket}/o/${encodeURIComponent(name)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok && res.status !== 204) throw new GcsApiError(`Google Cloud Storage API error: HTTP ${res.status}`);
        });
        return result.ok ? textResult(`Deleted ${name} from ${bucket}`) : errorResult(result.message);
      },
    },
  ],
});
