import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { graphRequest } from "./graph-client.js";

const listPagesSchema = z.object({});
const getPageInsightsSchema = z.object({ pageId: z.string(), metric: z.string().default("page_impressions") });
const createPostSchema = z.object({ pageId: z.string(), message: z.string() });
const uploadVideoSchema = z.object({ pageId: z.string(), videoUrl: z.string(), description: z.string().optional() });
const uploadPhotoSchema = z.object({ pageId: z.string(), imageUrl: z.string(), caption: z.string().optional() });

await startConnector({
  name: "facebook-pages",
  version: "0.1.0",
  tools: [
    {
      name: "list_pages",
      description: "List Facebook Pages the authenticated token can manage.",
      inputSchema: listPagesSchema,
      async handler() {
        const { data } = await graphRequest<{ data: unknown[] }>("me/accounts");
        return jsonResult(data);
      },
    },
    {
      name: "get_page_insights",
      description: "Get performance metrics for a Page.",
      inputSchema: getPageInsightsSchema,
      async handler({ pageId, metric }) {
        const { data } = await graphRequest<{ data: unknown[] }>(`${pageId}/insights`, { metric });
        return jsonResult(data);
      },
    },
    {
      name: "create_post",
      description: "Publish a text post to a Page's feed.",
      inputSchema: createPostSchema,
      async handler({ pageId, message }) {
        const { id } = await graphRequest<{ id: string }>(`${pageId}/feed`, { message }, "POST");
        return jsonResult({ postId: id });
      },
    },
    {
      name: "upload_video",
      description: "Upload and publish a video to a Page, fetched from a public URL.",
      inputSchema: uploadVideoSchema,
      async handler({ pageId, videoUrl, description }) {
        const { id } = await graphRequest<{ id: string }>(
          `${pageId}/videos`,
          { file_url: videoUrl, ...(description ? { description } : {}) },
          "POST",
        );
        return jsonResult({ videoId: id });
      },
    },
    {
      name: "upload_photo",
      description: "Upload and publish a photo to a Page's feed, fetched from a public URL.",
      inputSchema: uploadPhotoSchema,
      async handler({ pageId, imageUrl, caption }) {
        const { id, post_id } = await graphRequest<{ id: string; post_id?: string }>(
          `${pageId}/photos`,
          { url: imageUrl, ...(caption ? { caption } : {}) },
          "POST",
        );
        return jsonResult({ photoId: id, postId: post_id });
      },
    },
  ],
});
