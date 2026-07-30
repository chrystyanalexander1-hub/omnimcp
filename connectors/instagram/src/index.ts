import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { graphRequest } from "./graph-client.js";

const listMediaSchema = z.object({ igUserId: z.string() });
const createMediaContainerSchema = z.object({
  igUserId: z.string(),
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  caption: z.string().optional(),
});
const publishMediaSchema = z.object({ igUserId: z.string(), creationId: z.string() });

await startConnector({
  name: "instagram",
  version: "0.1.0",
  tools: [
    {
      name: "list_media",
      description: "List media already published to an Instagram Business account.",
      inputSchema: listMediaSchema,
      async handler({ igUserId }) {
        const { data } = await graphRequest<{ data: unknown[] }>(`${igUserId}/media`, {
          fields: "id,caption,media_type,media_url,permalink,timestamp",
        });
        return jsonResult(data);
      },
    },
    {
      name: "create_media_container",
      description: "Create a draft media container from an image or video URL.",
      inputSchema: createMediaContainerSchema,
      async handler({ igUserId, imageUrl, videoUrl, caption }) {
        const { id } = await graphRequest<{ id: string }>(
          `${igUserId}/media`,
          {
            ...(imageUrl ? { image_url: imageUrl } : {}),
            ...(videoUrl ? { video_url: videoUrl, media_type: "REELS" } : {}),
            ...(caption ? { caption } : {}),
          },
          "POST",
        );
        return jsonResult({ creationId: id });
      },
    },
    {
      name: "publish_media",
      description: "Publish a previously created media container.",
      inputSchema: publishMediaSchema,
      async handler({ igUserId, creationId }) {
        const { id } = await graphRequest<{ id: string }>(`${igUserId}/media_publish`, { creation_id: creationId }, "POST");
        return jsonResult({ mediaId: id });
      },
    },
  ],
});
