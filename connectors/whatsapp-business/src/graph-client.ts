import { requireEnv } from "@omnimcp/connector-sdk-ts";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class WhatsAppApiError extends Error {}

/** WhatsApp Cloud API is part of the Meta Graph API — standard Bearer auth, unlike TikTok's custom header. */
export async function graphRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");
  const url = new URL(`${GRAPH_API_BASE}/${path}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${accessToken}` } };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(params);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok) {
    throw new WhatsAppApiError(json.error?.message ?? `WhatsApp API error: HTTP ${res.status}`);
  }
  return json as T;
}
