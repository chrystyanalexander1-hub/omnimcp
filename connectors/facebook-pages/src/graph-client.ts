import { requireEnv } from "@omnimcp/connector-sdk-ts";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class FacebookApiError extends Error {}

/**
 * Same Meta Graph API host as connectors/meta-ads and connectors/whatsapp-business,
 * different permission scope. `list_pages` works with a User access token; posting
 * (`create_post`, `upload_video`) requires that specific Page's own access token —
 * the credential granted here should be a Page token if you intend to post, which is
 * what Meta's Graph API Explorer / Business Suite issue directly per page.
 */
export async function graphRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const accessToken = requireEnv("FACEBOOK_PAGE_ACCESS_TOKEN");
  const url = new URL(`${GRAPH_API_BASE}/${path}`);

  const init: RequestInit = { method };
  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    url.searchParams.set("access_token", accessToken);
  } else {
    init.body = new URLSearchParams({ ...(params as Record<string, string>), access_token: accessToken });
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok) {
    throw new FacebookApiError(json.error?.message ?? `Facebook API error: HTTP ${res.status}`);
  }
  return json as T;
}
