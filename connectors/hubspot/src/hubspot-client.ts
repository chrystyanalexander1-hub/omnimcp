import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://api.hubapi.com";

export class HubSpotApiError extends Error {}

/**
 * HubSpot's own docs recommend Private App access tokens (long-lived, no expiry)
 * for exactly this kind of server-to-server integration, over its full OAuth flow —
 * same rationale as GitHub's PAT and Meta Ads' long-lived token.
 */
export async function hubspotRequest<T>(
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "PATCH" = "GET",
): Promise<T> {
  const token = requireEnv("HUBSPOT_ACCESS_TOKEN");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as { message?: string };
  if (!res.ok) {
    throw new HubSpotApiError(json.message ?? `HubSpot API error: HTTP ${res.status}`);
  }
  return json as T;
}
