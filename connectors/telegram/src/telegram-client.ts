import { requireEnv } from "@omnimcp/connector-sdk-ts";

export class TelegramApiError extends Error {}

/** Telegram's Bot API embeds the token directly in the URL path rather than a header. */
export async function telegramRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = (await res.json()) as { ok: boolean; description?: string; result: T };
  if (!res.ok || !json.ok) {
    throw new TelegramApiError(json.description ?? `Telegram API error: HTTP ${res.status}`);
  }
  return json.result;
}
