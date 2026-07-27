import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://open.tiktokapis.com/v2";

export class TikTokContentApiError extends Error {}

interface TikTokEnvelope<T> {
  data: T;
  error: { code: string; message: string; log_id: string };
}

/**
 * TikTok's Content Posting API (organic publishing) is a completely different
 * product from the Business/Marketing API that connectors/tiktok-ads talks to —
 * different host, different auth app, different token. This connector uses a
 * long-lived access token (same api_key pattern as tiktok-ads) rather than
 * OmniMCP's generic OAuth2 flow, because TikTok's v2 OAuth uses `client_key`
 * instead of the `client_id` param name that flow assumes — plugging in here
 * without adjusting that flow would silently break the authorization request.
 */
export async function tiktokContentRequest<T>(path: string, body: Record<string, unknown> = {}, method: "GET" | "POST" = "POST"): Promise<T> {
  const accessToken = requireEnv("TIKTOK_CONTENT_ACCESS_TOKEN");
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
  };
  if (method === "POST") init.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, init);
  const json = (await res.json()) as TikTokEnvelope<T>;
  if (!res.ok || json.error?.code !== "ok") {
    throw new TikTokContentApiError(json.error?.message ?? `TikTok API error: HTTP ${res.status}`);
  }
  return json.data;
}
