import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { RedditApiError, redditGet, redditPostForm } from "./reddit-client.js";

const listSubredditPostsSchema = z.object({
  subreddit: z.string(),
  sort: z.enum(["hot", "new", "top", "rising"]).default("hot"),
  limit: z.number().default(10),
});
const submitPostSchema = z.object({
  subreddit: z.string(),
  title: z.string(),
  text: z.string().optional(),
  url: z.string().optional(),
});
const submitCommentSchema = z.object({ parentFullname: z.string(), text: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof RedditApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "reddit",
  version: "0.1.0",
  tools: [
    {
      name: "list_subreddit_posts",
      description: "List posts from a subreddit.",
      inputSchema: listSubredditPostsSchema,
      async handler({ subreddit, sort, limit }) {
        const result = await safe(() =>
          redditGet<{ data: { children: Array<{ data: unknown }> } }>(`/r/${subreddit}/${sort}`, { limit }),
        );
        return result.ok ? jsonResult(result.value.data.children.map((c) => c.data)) : errorResult(result.message);
      },
    },
    {
      name: "submit_post",
      description: "Submit a new post to a subreddit — text post if `text` is given, link post if `url` is given.",
      inputSchema: submitPostSchema,
      async handler({ subreddit, title, text, url }) {
        const result = await safe(() =>
          redditPostForm<{ id?: string; name?: string; url?: string }>("/api/submit", {
            sr: subreddit,
            title,
            kind: url ? "link" : "self",
            ...(text ? { text } : {}),
            ...(url ? { url } : {}),
          }),
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "submit_comment",
      description: "Reply to a post or comment.",
      inputSchema: submitCommentSchema,
      async handler({ parentFullname, text }) {
        const result = await safe(() =>
          redditPostForm<{ things?: unknown[] }>("/api/comment", { thing_id: parentFullname, text }),
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
  ],
});
