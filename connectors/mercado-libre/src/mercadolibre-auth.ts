import { requireEnv } from "@omnimcp/connector-sdk-ts";

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

let cached: CachedToken | null = null;

/**
 * Standard body-based OAuth2 refresh, same shape as connectors/google-calendar. The
 * one thing that makes Mercado Libre different — it invalidates the refresh_token on
 * every exchange, including this one — is handled centrally now, not here:
 * ConnectorProcessManager already refreshed the token once and persisted the new
 * refresh_token before this process was even spawned (see
 * `refreshTokenRotates` on this connector's manifest and
 * packages/core-infrastructure/src/services/connector-process-manager.ts). This
 * connector just does its own normal per-call access-token refresh like any other
 * OAuth2 connector; it doesn't need to know about the rotation at all.
 */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("MERCADOLIBRE_CLIENT_ID"),
      client_secret: requireEnv("MERCADOLIBRE_CLIENT_SECRET"),
      refresh_token: requireEnv("MERCADOLIBRE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Mercado Libre access token: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cached = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.accessToken;
}
