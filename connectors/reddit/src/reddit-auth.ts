import { requireEnv } from "@omnimcp/connector-sdk-ts";

export const REDDIT_USER_AGENT = "web:omnimcp-ai:v0.1.0 (by /u/omnimcp)";

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

let cached: CachedToken | null = null;

/**
 * Reddit requires client credentials as an HTTP Basic Auth header (same as
 * connectors/pinterest, see that connector for the shared rationale) and, separately,
 * a descriptive User-Agent on every API call or it aggressively rate-limits/blocks —
 * see REDDIT_USER_AGENT above, reused by reddit-client.ts. The refresh token itself is
 * only issued because the authorization request includes `duration=permanent` (see
 * connector.manifest.json's `authorizationExtraParams`); without it Reddit hands back
 * a 1-hour access token and no refresh token at all.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const clientId = requireEnv("REDDIT_CLIENT_ID");
  const clientSecret = requireEnv("REDDIT_CLIENT_SECRET");

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "User-Agent": REDDIT_USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: requireEnv("REDDIT_REFRESH_TOKEN"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Reddit access token: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.accessToken;
}
