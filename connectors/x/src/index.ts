import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { xRequest } from "./x-client.js";

const getMeSchema = z.object({});
const createTweetSchema = z.object({ text: z.string() });
const deleteTweetSchema = z.object({ tweetId: z.string() });

await startConnector({
  name: "x",
  version: "0.1.0",
  tools: [
    {
      name: "get_me",
      description: "Get the authenticated account's profile.",
      inputSchema: getMeSchema,
      async handler() {
        const { data } = await xRequest<{ data: unknown }>("/users/me");
        return jsonResult(data);
      },
    },
    {
      name: "create_tweet",
      description: "Publish a new post.",
      inputSchema: createTweetSchema,
      async handler({ text }) {
        const { data } = await xRequest<{ data: { id: string } }>("/tweets", { text }, "POST");
        return jsonResult({ tweetId: data.id });
      },
    },
    {
      name: "delete_tweet",
      description: "Delete a post.",
      inputSchema: deleteTweetSchema,
      async handler({ tweetId }) {
        const { data } = await xRequest<{ data: { deleted: boolean } }>(`/tweets/${tweetId}`, undefined, "DELETE");
        return jsonResult(data);
      },
    },
  ],
});
