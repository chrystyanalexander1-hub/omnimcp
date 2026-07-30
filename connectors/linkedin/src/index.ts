import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { createPost, getProfile } from "./linkedin-client.js";

const getProfileSchema = z.object({});
const createPostSchema = z.object({ text: z.string(), visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC") });

await startConnector({
  name: "linkedin",
  version: "0.1.0",
  tools: [
    {
      name: "get_profile",
      description: "Get the authenticated member's basic profile.",
      inputSchema: getProfileSchema,
      async handler() {
        return jsonResult(await getProfile());
      },
    },
    {
      name: "create_post",
      description: "Publish a text post to the authenticated member's LinkedIn feed.",
      inputSchema: createPostSchema,
      async handler({ text, visibility }) {
        return jsonResult(await createPost(text, visibility));
      },
    },
  ],
});
