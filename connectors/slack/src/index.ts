import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { SlackApiError, listChannels, sendMessage, uploadFile } from "./slack-client.js";

const listChannelsSchema = z.object({});
const sendMessageSchema = z.object({ channel: z.string(), text: z.string() });
const uploadFileSchema = z.object({
  channel: z.string(),
  filename: z.string(),
  contentBase64: z.string(),
  title: z.string().optional(),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof SlackApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "slack",
  version: "0.1.0",
  tools: [
    {
      name: "list_channels",
      description: "List channels the bot can see.",
      inputSchema: listChannelsSchema,
      async handler() {
        const result = await safe(() => listChannels());
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "send_message",
      description: "Send a text message to a channel.",
      inputSchema: sendMessageSchema,
      async handler({ channel, text }) {
        const result = await safe(() => sendMessage(channel, text));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "upload_file",
      description: "Upload a file to a channel.",
      inputSchema: uploadFileSchema,
      async handler({ channel, filename, contentBase64, title }) {
        const result = await safe(() => uploadFile(channel, filename, contentBase64, title));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
  ],
});
