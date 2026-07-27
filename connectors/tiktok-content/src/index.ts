import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { TikTokContentApiError, tiktokContentRequest } from "./tiktok-content-client.js";

const getCreatorInfoSchema = z.object({});
const publishVideoFromUrlSchema = z.object({
  videoUrl: z.string(),
  title: z.string(),
  privacyLevel: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]).default("SELF_ONLY"),
});
const getPublishStatusSchema = z.object({ publishId: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof TikTokContentApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "tiktok-content",
  version: "0.1.0",
  tools: [
    {
      name: "get_creator_info",
      description: "Get the creator's posting eligibility and privacy/interaction options.",
      inputSchema: getCreatorInfoSchema,
      async handler() {
        const result = await safe(() => tiktokContentRequest("/post/publish/creator_info/query/"));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "publish_video_from_url",
      description: "Publish a video TikTok fetches from a public URL.",
      inputSchema: publishVideoFromUrlSchema,
      async handler({ videoUrl, title, privacyLevel }) {
        const result = await safe(() =>
          tiktokContentRequest<{ publish_id: string }>("/post/publish/video/init/", {
            post_info: { title, privacy_level: privacyLevel },
            source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
          }),
        );
        return result.ok ? jsonResult({ publishId: result.value.publish_id }) : errorResult(result.message);
      },
    },
    {
      name: "get_publish_status",
      description: "Check the processing/publish status of a previously submitted video.",
      inputSchema: getPublishStatusSchema,
      async handler({ publishId }) {
        const result = await safe(() => tiktokContentRequest("/post/publish/status/fetch/", { publish_id: publishId }));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
  ],
});
