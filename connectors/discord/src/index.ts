import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { discordRequest } from "./discord-client.js";

const listGuildChannelsSchema = z.object({ guildId: z.string() });
const getChannelMessagesSchema = z.object({ channelId: z.string(), limit: z.number().default(20) });
const sendMessageSchema = z.object({ channelId: z.string(), content: z.string() });

await startConnector({
  name: "discord",
  version: "0.1.0",
  tools: [
    {
      name: "list_guild_channels",
      description: "List channels in a server the bot belongs to.",
      inputSchema: listGuildChannelsSchema,
      async handler({ guildId }) {
        return jsonResult(await discordRequest(`/guilds/${guildId}/channels`));
      },
    },
    {
      name: "get_channel_messages",
      description: "Fetch recent messages from a channel.",
      inputSchema: getChannelMessagesSchema,
      async handler({ channelId, limit }) {
        return jsonResult(await discordRequest(`/channels/${channelId}/messages?limit=${limit}`));
      },
    },
    {
      name: "send_message",
      description: "Send a text message to a channel.",
      inputSchema: sendMessageSchema,
      async handler({ channelId, content }) {
        const { id } = await discordRequest<{ id: string }>(`/channels/${channelId}/messages`, { content }, "POST");
        return jsonResult({ messageId: id });
      },
    },
  ],
});
