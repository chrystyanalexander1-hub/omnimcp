import { requireEnv } from "@omnimcp/connector-sdk-ts";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class InstagramApiError extends Error {}

/** Instagram Business accounts are managed through the same Meta Graph API as Facebook Pages/Meta Ads — same host, this connector's own token/permission scope. */
export async function graphRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const accessToken = requireEnv("INSTAGRAM_ACCESS_TOKEN");
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
    throw new InstagramApiError(json.error?.message ?? `Instagram API error: HTTP ${res.status}`);
  }
  return json as T;
}
