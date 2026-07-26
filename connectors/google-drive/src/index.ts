import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./google-auth.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

const listFilesSchema = z.object({});
const uploadFileSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  contentBase64: z.string(),
});
const downloadFileSchema = z.object({ fileId: z.string() });

await startConnector({
  name: "google-drive",
  version: "0.1.0",
  tools: [
    {
      name: "list_files",
      description: "List files in the authenticated user's Google Drive.",
      inputSchema: listFilesSchema,
      async handler() {
        const token = await getAccessToken();
        const res = await fetch(`${DRIVE_API}/files?pageSize=50&fields=files(id,name,mimeType,webViewLink)`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return errorResult(`Google Drive API error: ${res.status} ${await res.text()}`);
        const data = (await res.json()) as { files: unknown[] };
        return jsonResult(data.files);
      },
    },
    {
      name: "upload_file",
      description: "Upload a file to Google Drive.",
      inputSchema: uploadFileSchema,
      async handler({ name, mimeType, contentBase64 }) {
        const token = await getAccessToken();
        const boundary = `omnimcp-${crypto.randomUUID()}`;
        const body =
          `--${boundary}\r\n` +
          `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name })}\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: ${mimeType}\r\n` +
          `Content-Transfer-Encoding: base64\r\n\r\n${contentBase64}\r\n` +
          `--${boundary}--`;

        const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        });
        if (!res.ok) return errorResult(`Google Drive API error: ${res.status} ${await res.text()}`);
        return jsonResult(await res.json());
      },
    },
    {
      name: "download_file",
      description: "Download a file's content from Google Drive as base64.",
      inputSchema: downloadFileSchema,
      async handler({ fileId }) {
        const token = await getAccessToken();
        const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return errorResult(`Google Drive API error: ${res.status} ${await res.text()}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        return jsonResult({ contentBase64: buffer.toString("base64"), byteLength: buffer.length });
      },
    },
  ],
});
