import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://discord.com/api/v10";

export class DiscordApiError extends Error {}

/** Discord bot auth uses the "Bot" scheme, not "Bearer". */
export async function discordRequest<T>(path: string, body?: unknown, method: "GET" | "POST" = "GET"): Promise<T> {
  const token = requireEnv("DISCORD_BOT_TOKEN");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as { message?: string } & T;
  if (!res.ok) {
    throw new DiscordApiError(json.message ?? `Discord API error: HTTP ${res.status}`);
  }
  return json;
}
