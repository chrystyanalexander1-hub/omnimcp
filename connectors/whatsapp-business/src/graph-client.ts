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

/**
 * Uploads bytes to WhatsApp's Media API ahead of sending them, for content that isn't
 * already hosted at a public URL. Returns a media id usable in place of `link` in any
 * `send_*_message` tool. Unlike `graphRequest`, this is a multipart/form-data POST —
 * the Graph API rejects a JSON body for this endpoint.
 */
export async function uploadMedia(
  phoneNumberId: string,
  contentBase64: string,
  mimeType: string,
  filename?: string,
): Promise<{ id: string }> {
  const accessToken = requireEnv("WHATSAPP_ACCESS_TOKEN");
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mimeType);
  form.set("file", new Blob([Buffer.from(contentBase64, "base64")], { type: mimeType }), filename ?? "file");

  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new WhatsAppApiError(json.error?.message ?? `WhatsApp API error: HTTP ${res.status}`);
  }
  return { id: json.id };
}
