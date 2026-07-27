import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { LinkedInApiError, createPost, getProfile } from "./linkedin-client.js";

const getProfileSchema = z.object({});
const createPostSchema = z.object({ text: z.string(), visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC") });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof LinkedInApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "linkedin",
  version: "0.1.0",
  tools: [
    {
      name: "get_profile",
      description: "Get the authenticated member's basic profile.",
      inputSchema: getProfileSchema,
      async handler() {
        const result = await safe(() => getProfile());
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "create_post",
      description: "Publish a text post to the authenticated member's LinkedIn feed.",
      inputSchema: createPostSchema,
      async handler({ text, visibility }) {
        const result = await safe(() => createPost(text, visibility));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
  ],
});
