import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { InstagramApiError, graphRequest } from "./graph-client.js";

const listMediaSchema = z.object({ igUserId: z.string() });
const createMediaContainerSchema = z.object({
  igUserId: z.string(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  caption: z.string().optional(),
});
const publishMediaSchema = z.object({ igUserId: z.string(), creationId: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof InstagramApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "instagram",
  version: "0.1.0",
  tools: [
    {
      name: "list_media",
      description: "List media already published to an Instagram Business account.",
      inputSchema: listMediaSchema,
      async handler({ igUserId }) {
        const result = await safe(() =>
          graphRequest<{ data: unknown[] }>(`${igUserId}/media`, { fields: "id,caption,media_type,media_url,permalink,timestamp" }),
        );
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "create_media_container",
      description: "Create a draft media container from an image or video URL.",
      inputSchema: createMediaContainerSchema,
      async handler({ igUserId, imageUrl, videoUrl, caption }) {
        const result = await safe(() =>
          graphRequest<{ id: string }>(
            `${igUserId}/media`,
            {
              ...(imageUrl ? { image_url: imageUrl } : {}),
              ...(videoUrl ? { video_url: videoUrl, media_type: "REELS" } : {}),
              ...(caption ? { caption } : {}),
            },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ creationId: result.value.id }) : errorResult(result.message);
      },
    },
    {
      name: "publish_media",
      description: "Publish a previously created media container.",
      inputSchema: publishMediaSchema,
      async handler({ igUserId, creationId }) {
        const result = await safe(() =>
          graphRequest<{ id: string }>(`${igUserId}/media_publish`, { creation_id: creationId }, "POST"),
        );
        return result.ok ? jsonResult({ mediaId: result.value.id }) : errorResult(result.message);
      },
    },
  ],
});
