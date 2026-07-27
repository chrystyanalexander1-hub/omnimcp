import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { AzureBlobApiError, deleteBlob, downloadBlob, listBlobs, uploadBlob } from "./azure-client.js";

const listBlobsSchema = z.object({ container: z.string(), prefix: z.string().optional() });
const uploadBlobSchema = z.object({
  container: z.string(),
  blobName: z.string(),
  contentBase64: z.string(),
  contentType: z.string().default("application/octet-stream"),
});
const downloadBlobSchema = z.object({ container: z.string(), blobName: z.string() });
const deleteBlobSchema = z.object({ container: z.string(), blobName: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof AzureBlobApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "azure-blob-storage",
  version: "0.1.0",
  tools: [
    {
      name: "list_blobs",
      description: "List blobs in a container.",
      inputSchema: listBlobsSchema,
      async handler({ container, prefix }) {
        const result = await safe(() => listBlobs(container, prefix));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "upload_blob",
      description: "Upload a blob to a container.",
      inputSchema: uploadBlobSchema,
      async handler({ container, blobName, contentBase64, contentType }) {
        const result = await safe(() => uploadBlob(container, blobName, Buffer.from(contentBase64, "base64"), contentType));
        return result.ok ? textResult(`Uploaded ${blobName} to ${container}`) : errorResult(result.message);
      },
    },
    {
      name: "download_blob",
      description: "Download a blob's content as base64.",
      inputSchema: downloadBlobSchema,
      async handler({ container, blobName }) {
        const result = await safe(async () => {
          const buffer = await downloadBlob(container, blobName);
          return { contentBase64: buffer.toString("base64"), byteLength: buffer.length };
        });
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "delete_blob",
      description: "Permanently delete a blob from a container.",
      inputSchema: deleteBlobSchema,
      async handler({ container, blobName }) {
        const result = await safe(() => deleteBlob(container, blobName));
        return result.ok ? textResult(`Deleted ${blobName} from ${container}`) : errorResult(result.message);
      },
    },
  ],
});
