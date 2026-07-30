import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { sendVideo, telegramRequest } from "./telegram-client.js";

const getMeSchema = z.object({});
const getChatSchema = z.object({ chatId: z.string() });
const getUpdatesSchema = z.object({ limit: z.number().default(20), offset: z.number().optional() });
const sendMessageSchema = z.object({ chatId: z.string(), text: z.string() });
const sendVideoSchema = z.object({
  chatId: z.string(),
  videoUrl: z.string().optional(),
  contentBase64: z.string().optional(),
  caption: z.string().optional(),
});

await startConnector({
  name: "telegram",
  version: "0.1.0",
  tools: [
    {
      name: "get_me",
      description: "Get basic information about the bot itself.",
      inputSchema: getMeSchema,
      async handler() {
        return jsonResult(await telegramRequest("getMe"));
      },
    },
    {
      name: "get_chat",
      description: "Get information about a chat by its ID or @username.",
      inputSchema: getChatSchema,
      async handler({ chatId }) {
        return jsonResult(await telegramRequest("getChat", { chat_id: chatId }));
      },
    },
    {
      name: "get_updates",
      description: "Fetch recent messages/events sent to the bot.",
      inputSchema: getUpdatesSchema,
      async handler({ limit, offset }) {
        return jsonResult(await telegramRequest("getUpdates", { limit, ...(offset !== undefined ? { offset } : {}) }));
      },
    },
    {
      name: "send_message",
      description: "Send a text message to a chat, group, or channel.",
      inputSchema: sendMessageSchema,
      async handler({ chatId, text }) {
        const { message_id } = await telegramRequest<{ message_id: number }>("sendMessage", { chat_id: chatId, text });
        return jsonResult({ messageId: message_id });
      },
    },
    {
      name: "send_video",
      description: "Send a video to a chat, group, or channel.",
      inputSchema: sendVideoSchema,
      async handler({ chatId, videoUrl, contentBase64, caption }) {
        const { message_id } = await sendVideo(chatId, {
          ...(videoUrl ? { videoUrl } : {}),
          ...(contentBase64 ? { contentBase64 } : {}),
          ...(caption ? { caption } : {}),
        });
        return jsonResult({ messageId: message_id });
      },
    },
  ],
});
