import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { DiscordApiError, discordRequest } from "./discord-client.js";

const listGuildChannelsSchema = z.object({ guildId: z.string() });
const getChannelMessagesSchema = z.object({ channelId: z.string(), limit: z.number().default(20) });
const sendMessageSchema = z.object({ channelId: z.string(), content: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof DiscordApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "discord",
  version: "0.1.0",
  tools: [
    {
      name: "list_guild_channels",
      description: "List channels in a server the bot belongs to.",
      inputSchema: listGuildChannelsSchema,
      async handler({ guildId }) {
        const result = await safe(() => discordRequest(`/guilds/${guildId}/channels`));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "get_channel_messages",
      description: "Fetch recent messages from a channel.",
      inputSchema: getChannelMessagesSchema,
      async handler({ channelId, limit }) {
        const result = await safe(() => discordRequest(`/channels/${channelId}/messages?limit=${limit}`));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "send_message",
      description: "Send a text message to a channel.",
      inputSchema: sendMessageSchema,
      async handler({ channelId, content }) {
        const result = await safe(() =>
          discordRequest<{ id: string }>(`/channels/${channelId}/messages`, { content }, "POST"),
        );
        return result.ok ? jsonResult({ messageId: result.value.id }) : errorResult(result.message);
      },
    },
  ],
});
