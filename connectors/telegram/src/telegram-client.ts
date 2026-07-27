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

/**
 * Video is either fetched by Telegram from a URL (JSON body, like every other
 * method) or uploaded directly as bytes (multipart form) — the Bot API accepts
 * both, so this picks whichever the caller provided instead of forcing one path.
 */
export async function sendVideo(
  chatId: string,
  opts: { videoUrl?: string; contentBase64?: string; caption?: string },
): Promise<{ message_id: number }> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");

  if (opts.videoUrl) {
    return telegramRequest("sendVideo", {
      chat_id: chatId,
      video: opts.videoUrl,
      ...(opts.caption ? { caption: opts.caption } : {}),
    });
  }
  if (opts.contentBase64) {
    const form = new FormData();
    form.set("chat_id", chatId);
    if (opts.caption) form.set("caption", opts.caption);
    form.set("video", new Blob([Buffer.from(opts.contentBase64, "base64")]), "video.mp4");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, { method: "POST", body: form });
    const json = (await res.json()) as { ok: boolean; description?: string; result: { message_id: number } };
    if (!res.ok || !json.ok) {
      throw new TelegramApiError(json.description ?? `Telegram API error: HTTP ${res.status}`);
    }
    return json.result;
  }
  throw new TelegramApiError("Either videoUrl or contentBase64 must be provided");
}
