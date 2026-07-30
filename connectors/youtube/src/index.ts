import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./google-auth.js";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";

export class YouTubeApiError extends Error {}

const listMyVideosSchema = z.object({ maxResults: z.number().default(25) });
const getVideoStatsSchema = z.object({ videoId: z.string() });
const updateVideoMetadataSchema = z.object({
  videoId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});
const uploadVideoSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  contentBase64: z.string(),
  mimeType: z.string().default("video/mp4"),
  privacyStatus: z.enum(["public", "unlisted", "private"]).default("private"),
});

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new YouTubeApiError(json.error?.message ?? `YouTube API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "youtube",
  version: "0.1.0",
  tools: [
    {
      name: "list_my_videos",
      description: "List videos uploaded by the authenticated channel.",
      inputSchema: listMyVideosSchema,
      async handler({ maxResults }) {
        const token = await getAccessToken();
        const res = await fetch(
          `${YOUTUBE_API}/search?part=id,snippet&forMine=true&type=video&maxResults=${maxResults}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const { items } = await handle<{ items: unknown[] }>(res);
        return jsonResult(items);
      },
    },
    {
      name: "get_video_stats",
      description: "Get view/like/comment counts and snippet metadata for a video.",
      inputSchema: getVideoStatsSchema,
      async handler({ videoId }) {
        const token = await getAccessToken();
        const res = await fetch(`${YOUTUBE_API}/videos?part=statistics,snippet&id=${videoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const { items } = await handle<{ items: unknown[] }>(res);
        return jsonResult(items[0] ?? null);
      },
    },
    {
      name: "update_video_metadata",
      description: "Update a video's public title/description.",
      inputSchema: updateVideoMetadataSchema,
      async handler({ videoId, title, description }) {
        const token = await getAccessToken();
        const current = await handle<{ items: Array<{ snippet: Record<string, unknown> }> }>(
          await fetch(`${YOUTUBE_API}/videos?part=snippet&id=${videoId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        const snippet = current.items[0]?.snippet;
        if (!snippet) throw new YouTubeApiError(`Video ${videoId} not found`);

        const res = await fetch(`${YOUTUBE_API}/videos?part=snippet`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            id: videoId,
            snippet: { ...snippet, ...(title ? { title } : {}), ...(description ? { description } : {}) },
          }),
        });
        return jsonResult(await handle(res));
      },
    },
    {
      name: "upload_video",
      description: "Upload and publish a new video.",
      inputSchema: uploadVideoSchema,
      async handler({ title, description, contentBase64, mimeType, privacyStatus }) {
        const token = await getAccessToken();
        const boundary = `omnimcp-${crypto.randomUUID()}`;
        const metadata = JSON.stringify({ snippet: { title, description }, status: { privacyStatus } });
        const body =
          `--${boundary}\r\n` +
          `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: ${mimeType}\r\n` +
          `Content-Transfer-Encoding: base64\r\n\r\n${contentBase64}\r\n` +
          `--${boundary}--`;

        const res = await fetch(`${YOUTUBE_UPLOAD_API}/videos?uploadType=multipart&part=snippet,status`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        });
        const { id } = await handle<{ id: string }>(res);
        return textResult(`Uploaded video ${id}`);
      },
    },
  ],
});
