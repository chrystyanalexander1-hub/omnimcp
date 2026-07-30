import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { listChannels, sendMessage, uploadFile } from "./slack-client.js";

const listChannelsSchema = z.object({});
const sendMessageSchema = z.object({ channel: z.string(), text: z.string() });
const uploadFileSchema = z.object({
  channel: z.string(),
  filename: z.string(),
  contentBase64: z.string(),
  title: z.string().optional(),
});

await startConnector({
  name: "slack",
  version: "0.1.0",
  tools: [
    {
      name: "list_channels",
      description: "List channels the bot can see.",
      inputSchema: listChannelsSchema,
      async handler() {
        return jsonResult(await listChannels());
      },
    },
    {
      name: "send_message",
      description: "Send a text message to a channel.",
      inputSchema: sendMessageSchema,
      async handler({ channel, text }) {
        return jsonResult(await sendMessage(channel, text));
      },
    },
    {
      name: "upload_file",
      description: "Upload a file to a channel.",
      inputSchema: uploadFileSchema,
      async handler({ channel, filename, contentBase64, title }) {
        return jsonResult(await uploadFile(channel, filename, contentBase64, title));
      },
    },
  ],
});
