import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { XApiError, xRequest } from "./x-client.js";

const getMeSchema = z.object({});
const createTweetSchema = z.object({ text: z.string() });
const deleteTweetSchema = z.object({ tweetId: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof XApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "x",
  version: "0.1.0",
  tools: [
    {
      name: "get_me",
      description: "Get the authenticated account's profile.",
      inputSchema: getMeSchema,
      async handler() {
        const result = await safe(() => xRequest<{ data: unknown }>("/users/me"));
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "create_tweet",
      description: "Publish a new post.",
      inputSchema: createTweetSchema,
      async handler({ text }) {
        const result = await safe(() => xRequest<{ data: { id: string } }>("/tweets", { text }, "POST"));
        return result.ok ? jsonResult({ tweetId: result.value.data.id }) : errorResult(result.message);
      },
    },
    {
      name: "delete_tweet",
      description: "Delete a post.",
      inputSchema: deleteTweetSchema,
      async handler({ tweetId }) {
        const result = await safe(() => xRequest<{ data: { deleted: boolean } }>(`/tweets/${tweetId}`, undefined, "DELETE"));
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
  ],
});
