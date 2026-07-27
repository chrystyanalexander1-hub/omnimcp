import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export class TikTokApiError extends Error {}

interface TikTokEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * TikTok's Business API authenticates with a custom `Access-Token` header (not
 * `Authorization: Bearer`), and wraps every response in `{ code, message, data }`
 * where `code !== 0` means failure — different enough from Meta/GitHub's conventions
 * that it gets its own thin client rather than reusing graph-client.ts.
 */
export async function tiktokRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const accessToken = requireEnv("TIKTOK_ADS_ACCESS_TOKEN");
  const url = new URL(`${API_BASE}${path}`);
  const init: RequestInit = { method, headers: { "Access-Token": accessToken, "Content-Type": "application/json" } };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
  } else {
    init.body = JSON.stringify(params);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as TikTokEnvelope<T>;
  if (!res.ok || json.code !== 0) {
    throw new TikTokApiError(json.message ?? `TikTok API error: HTTP ${res.status}`);
  }
  return json.data;
}
