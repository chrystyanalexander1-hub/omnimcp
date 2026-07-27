import { requireEnv } from "@omnimcp/connector-sdk-ts";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class GraphApiError extends Error {}

/**
 * Thin wrapper over the Meta Graph API (Marketing API endpoints). Meta's OAuth does
 * not issue a spec-standard `refresh_token` the way Google's does — instead it issues
 * long-lived (up to 60 day) user tokens, or non-expiring System User tokens meant
 * exactly for server-to-server use. So this connector takes a long-lived access token
 * as a plain credential (like the GitHub connector's PAT), not through the platform's
 * generic OAuth2+PKCE flow.
 */
export async function graphRequest<T>(
  path: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const accessToken = requireEnv("META_ADS_ACCESS_TOKEN");
  const url = new URL(`${GRAPH_API_BASE}/${path}`);

  const init: RequestInit = { method };
  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("access_token", accessToken);
  } else {
    const body = new URLSearchParams({ ...params, access_token: accessToken });
    init.body = body;
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok) {
    const message = json.error?.message ?? `Graph API error: HTTP ${res.status}`;
    throw new GraphApiError(message);
  }
  return json as T;
}
