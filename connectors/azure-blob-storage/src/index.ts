import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { deleteBlob, downloadBlob, listBlobs, uploadBlob } from "./azure-client.js";

const listBlobsSchema = z.object({ container: z.string(), prefix: z.string().optional() });
const uploadBlobSchema = z.object({
  container: z.string(),
  blobName: z.string(),
  contentBase64: z.string(),
  contentType: z.string().default("application/octet-stream"),
});
const downloadBlobSchema = z.object({ container: z.string(), blobName: z.string() });
const deleteBlobSchema = z.object({ container: z.string(), blobName: z.string() });

await startConnector({
  name: "azure-blob-storage",
  version: "0.1.0",
  tools: [
    {
      name: "list_blobs",
      description: "List blobs in a container.",
      inputSchema: listBlobsSchema,
      async handler({ container, prefix }) {
        return jsonResult(await listBlobs(container, prefix));
      },
    },
    {
      name: "upload_blob",
      description: "Upload a blob to a container.",
      inputSchema: uploadBlobSchema,
      async handler({ container, blobName, contentBase64, contentType }) {
        await uploadBlob(container, blobName, Buffer.from(contentBase64, "base64"), contentType);
        return textResult(`Uploaded ${blobName} to ${container}`);
      },
    },
    {
      name: "download_blob",
      description: "Download a blob's content as base64.",
      inputSchema: downloadBlobSchema,
      async handler({ container, blobName }) {
        const buffer = await downloadBlob(container, blobName);
        return jsonResult({ contentBase64: buffer.toString("base64"), byteLength: buffer.length });
      },
    },
    {
      name: "delete_blob",
      description: "Permanently delete a blob from a container.",
      inputSchema: deleteBlobSchema,
      async handler({ container, blobName }) {
        await deleteBlob(container, blobName);
        return textResult(`Deleted ${blobName} from ${container}`);
      },
    },
  ],
});
