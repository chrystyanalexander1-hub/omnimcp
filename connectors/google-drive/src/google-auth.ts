import { requireEnv } from "@omnimcp/connector-sdk-ts";

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

let cached: CachedToken | null = null;

/**
 * The connector never receives a long-lived Google access token from the gateway —
 * only the tenant's refresh token (via GOOGLE_DRIVE_REFRESH_TOKEN) plus the shared
 * OAuth app credentials. It exchanges those for a short-lived access token itself and
 * caches it in memory until shortly before expiry.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: requireEnv("GOOGLE_DRIVE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Google access token: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.accessToken;
}
