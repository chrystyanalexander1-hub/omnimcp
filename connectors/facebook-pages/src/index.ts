import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { FacebookApiError, graphRequest } from "./graph-client.js";

const listPagesSchema = z.object({});
const getPageInsightsSchema = z.object({ pageId: z.string(), metric: z.string().default("page_impressions") });
const createPostSchema = z.object({ pageId: z.string(), message: z.string() });
const uploadVideoSchema = z.object({ pageId: z.string(), videoUrl: z.string(), description: z.string().optional() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof FacebookApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "facebook-pages",
  version: "0.1.0",
  tools: [
    {
      name: "list_pages",
      description: "List Facebook Pages the authenticated token can manage.",
      inputSchema: listPagesSchema,
      async handler() {
        const result = await safe(() => graphRequest<{ data: unknown[] }>("me/accounts"));
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "get_page_insights",
      description: "Get performance metrics for a Page.",
      inputSchema: getPageInsightsSchema,
      async handler({ pageId, metric }) {
        const result = await safe(() => graphRequest<{ data: unknown[] }>(`${pageId}/insights`, { metric }));
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "create_post",
      description: "Publish a text post to a Page's feed.",
      inputSchema: createPostSchema,
      async handler({ pageId, message }) {
        const result = await safe(() => graphRequest<{ id: string }>(`${pageId}/feed`, { message }, "POST"));
        return result.ok ? jsonResult({ postId: result.value.id }) : errorResult(result.message);
      },
    },
    {
      name: "upload_video",
      description: "Upload and publish a video to a Page, fetched from a public URL.",
      inputSchema: uploadVideoSchema,
      async handler({ pageId, videoUrl, description }) {
        const result = await safe(() =>
          graphRequest<{ id: string }>(
            `${pageId}/videos`,
            { file_url: videoUrl, ...(description ? { description } : {}) },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ videoId: result.value.id }) : errorResult(result.message);
      },
    },
  ],
});
