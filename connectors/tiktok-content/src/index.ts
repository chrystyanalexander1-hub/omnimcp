import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { tiktokContentRequest } from "./tiktok-content-client.js";

const getCreatorInfoSchema = z.object({});
const publishVideoFromUrlSchema = z.object({
  videoUrl: z.string(),
  title: z.string(),
  privacyLevel: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]).default("SELF_ONLY"),
});
const getPublishStatusSchema = z.object({ publishId: z.string() });

await startConnector({
  name: "tiktok-content",
  version: "0.1.0",
  tools: [
    {
      name: "get_creator_info",
      description: "Get the creator's posting eligibility and privacy/interaction options.",
      inputSchema: getCreatorInfoSchema,
      async handler() {
        return jsonResult(await tiktokContentRequest("/post/publish/creator_info/query/"));
      },
    },
    {
      name: "publish_video_from_url",
      description: "Publish a video TikTok fetches from a public URL.",
      inputSchema: publishVideoFromUrlSchema,
      async handler({ videoUrl, title, privacyLevel }) {
        const { publish_id } = await tiktokContentRequest<{ publish_id: string }>("/post/publish/video/init/", {
          post_info: { title, privacy_level: privacyLevel },
          source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
        });
        return jsonResult({ publishId: publish_id });
      },
    },
    {
      name: "get_publish_status",
      description: "Check the processing/publish status of a previously submitted video.",
      inputSchema: getPublishStatusSchema,
      async handler({ publishId }) {
        return jsonResult(await tiktokContentRequest("/post/publish/status/fetch/", { publish_id: publishId }));
      },
    },
  ],
});
