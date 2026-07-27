import { requireEnv } from "@omnimcp/connector-sdk-ts";

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

let cached: CachedToken | null = null;

/**
 * Unlike Google/Meta-style OAuth, Pinterest's token endpoint requires the client
 * credentials as an HTTP Basic Auth header and rejects them in the body — same
 * requirement as the initial code exchange in apps/rest-api/src/routes/oauth.ts
 * (see that connector's `auth.oauth.tokenAuthMethod: "basic"`). Refresh tokens are
 * reusable (not rotated on every exchange, unlike Mercado Libre).
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const clientId = requireEnv("PINTEREST_CLIENT_ID");
  const clientSecret = requireEnv("PINTEREST_CLIENT_SECRET");

  const response = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: requireEnv("PINTEREST_REFRESH_TOKEN"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Pinterest access token: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.accessToken;
}
