import { requireEnv } from "@omnimcp/connector-sdk-ts";

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

let cached: CachedToken | null = null;

/**
 * Snapchat's OAuth app is registered per developer (Business Manager), not shared like
 * Google's — this connector has its own SNAPCHAT_CLIENT_ID/SECRET rather than reusing
 * another connector's, same reasoning as connectors/mercado-libre would if it existed.
 * Unlike Mercado Libre, Snapchat's refresh tokens are reusable (not rotated on every
 * exchange), so a single refresh token granted once keeps working indefinitely.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const response = await fetch("https://accounts.snapchat.com/login/oauth2/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("SNAPCHAT_CLIENT_ID"),
      client_secret: requireEnv("SNAPCHAT_CLIENT_SECRET"),
      refresh_token: requireEnv("SNAPCHAT_ADS_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Snapchat access token: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.accessToken;
}
