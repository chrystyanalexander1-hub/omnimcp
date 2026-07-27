import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { TelegramApiError, sendVideo, telegramRequest } from "./telegram-client.js";

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

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof TelegramApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "telegram",
  version: "0.1.0",
  tools: [
    {
      name: "get_me",
      description: "Get basic information about the bot itself.",
      inputSchema: getMeSchema,
      async handler() {
        const result = await safe(() => telegramRequest("getMe"));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "get_chat",
      description: "Get information about a chat by its ID or @username.",
      inputSchema: getChatSchema,
      async handler({ chatId }) {
        const result = await safe(() => telegramRequest("getChat", { chat_id: chatId }));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "get_updates",
      description: "Fetch recent messages/events sent to the bot.",
      inputSchema: getUpdatesSchema,
      async handler({ limit, offset }) {
        const result = await safe(() =>
          telegramRequest("getUpdates", { limit, ...(offset !== undefined ? { offset } : {}) }),
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "send_message",
      description: "Send a text message to a chat, group, or channel.",
      inputSchema: sendMessageSchema,
      async handler({ chatId, text }) {
        const result = await safe(() =>
          telegramRequest<{ message_id: number }>("sendMessage", { chat_id: chatId, text }),
        );
        return result.ok ? jsonResult({ messageId: result.value.message_id }) : errorResult(result.message);
      },
    },
    {
      name: "send_video",
      description: "Send a video to a chat, group, or channel.",
      inputSchema: sendVideoSchema,
      async handler({ chatId, videoUrl, contentBase64, caption }) {
        const result = await safe(() =>
          sendVideo(chatId, { ...(videoUrl ? { videoUrl } : {}), ...(contentBase64 ? { contentBase64 } : {}), ...(caption ? { caption } : {}) }),
        );
        return result.ok ? jsonResult({ messageId: result.value.message_id }) : errorResult(result.message);
      },
    },
  ],
});
