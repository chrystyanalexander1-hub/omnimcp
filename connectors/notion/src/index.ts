import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { NotionApiError, notionRequest } from "./notion-client.js";

const searchSchema = z.object({ query: z.string().optional() });
const getPageSchema = z.object({ pageId: z.string() });
const createPageSchema = z.object({
  parentId: z.string(),
  parentType: z.enum(["page_id", "database_id"]).default("page_id"),
  title: z.string(),
  content: z.string().optional(),
});
const updatePageSchema = z.object({ pageId: z.string(), title: z.string() });

/** The title property is always named "title" for page-parented pages; database-parented pages commonly use "Name" instead — the same simplification most lightweight Notion integrations make rather than fetching the parent database's schema first. */
function titlePropertyKey(parentType: "page_id" | "database_id"): string {
  return parentType === "database_id" ? "Name" : "title";
}

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof NotionApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "notion",
  version: "0.1.0",
  tools: [
    {
      name: "search",
      description: "Search pages and databases the integration has access to.",
      inputSchema: searchSchema,
      async handler({ query }) {
        const result = await safe(() =>
          notionRequest<{ results: unknown[] }>("/search", { ...(query ? { query } : {}) }, "POST"),
        );
        return result.ok ? jsonResult(result.value.results) : errorResult(result.message);
      },
    },
    {
      name: "get_page",
      description: "Get a page's properties by ID.",
      inputSchema: getPageSchema,
      async handler({ pageId }) {
        const result = await safe(() => notionRequest(`/pages/${pageId}`));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "create_page",
      description: "Create a new page under a parent page or database.",
      inputSchema: createPageSchema,
      async handler({ parentId, parentType, title, content }) {
        const result = await safe(() =>
          notionRequest<{ id: string; url: string }>(
            "/pages",
            {
              parent: { [parentType]: parentId },
              properties: { [titlePropertyKey(parentType)]: { title: [{ text: { content: title } }] } },
              ...(content
                ? { children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content } }] } }] }
                : {}),
            },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ pageId: result.value.id, url: result.value.url }) : errorResult(result.message);
      },
    },
    {
      name: "update_page",
      description: "Update a page's title property.",
      inputSchema: updatePageSchema,
      async handler({ pageId, title }) {
        const result = await safe(() =>
          notionRequest(`/pages/${pageId}`, { properties: { title: { title: [{ text: { content: title } }] } } }, "PATCH"),
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
  ],
});
