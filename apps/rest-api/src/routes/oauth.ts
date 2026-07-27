import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { canManageConnectors, ConnectorId, TenantId, UserId, type Role } from "@omnimcp/core-domain";
import type { AppContext } from "@omnimcp/core-infrastructure";
import type { Env } from "@omnimcp/core-infrastructure";
import { requireAuth } from "../auth.js";
import { sendError } from "../error-handler.js";

const STATE_TTL_SECONDS = 600;

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

interface OAuthStateRecord {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly connectorId: string;
  readonly codeVerifier: string;
}

/**
 * Standard OAuth 2.0 Authorization Code flow with PKCE, generic over any connector
 * whose manifest declares `auth.type: "oauth2"` — Google Drive is the first
 * connector to use it, but Meta Ads, Slack, and every future OAuth connector reuse
 * this same pair of routes without any connector-specific code here.
 */
export function registerOAuthRoutes(app: FastifyInstance, context: AppContext, env: Env): void {
  app.get("/connectors/:id/oauth/start", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const identity = request.identity!;
      if (!canManageConnectors(identity.role)) {
        reply.code(403).send({ error: "Only tenant owners/admins can connect a connector's credentials" });
        return;
      }

      const connector = await context.repositories.connectors.findById(ConnectorId(id));
      if (!connector || connector.auth.type !== "oauth2" || !connector.auth.oauth) {
        reply.code(400).send({ error: `Connector "${id}" does not use OAuth2` });
        return;
      }

      const clientId = process.env[connector.auth.oauth.clientIdEnvVar];
      if (!clientId) {
        reply.code(500).send({ error: `Connector "${id}" is missing its OAuth client configuration on the server` });
        return;
      }

      const state = base64url(randomBytes(16));
      const codeVerifier = base64url(randomBytes(32));
      const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());

      const record: OAuthStateRecord = {
        tenantId: identity.tenantId,
        userId: identity.userId,
        role: identity.role,
        connectorId: id,
        codeVerifier,
      };
      await context.redis.set(`oauth:state:${state}`, JSON.stringify(record), "EX", STATE_TTL_SECONDS);

      const redirectUri = new URL(`/connectors/${id}/oauth/callback`, env.OAUTH_REDIRECT_BASE_URL).toString();
      const authorizationUrl = new URL(connector.auth.oauth.authorizationUrl);
      authorizationUrl.searchParams.set("client_id", clientId);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("scope", connector.auth.oauth.scopes.join(" "));
      authorizationUrl.searchParams.set("access_type", "offline");
      authorizationUrl.searchParams.set("prompt", "consent");
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("code_challenge", codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
      for (const [key, value] of Object.entries(connector.auth.oauth.authorizationExtraParams ?? {})) {
        authorizationUrl.searchParams.set(key, value);
      }

      reply.send({ authorizationUrl: authorizationUrl.toString() });
    } catch (err) {
      sendError(reply, err);
    }
  });

  // No requireAuth here: this endpoint is hit by the user's browser via a redirect
  // from the OAuth provider, not by an authenticated API caller. The one-time,
  // short-lived `state` token stands in for authentication.
  app.get("/connectors/:id/oauth/callback", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { code, state, error } = request.query as { code?: string; state?: string; error?: string };

      if (error) {
        reply.code(400).send({ error: `OAuth provider returned an error: ${error}` });
        return;
      }
      if (!code || !state) {
        reply.code(400).send({ error: "Missing code or state query parameter" });
        return;
      }

      const stateKey = `oauth:state:${state}`;
      const raw = await context.redis.get(stateKey);
      if (!raw) {
        reply.code(400).send({ error: "OAuth state is invalid or has expired; restart the connection flow" });
        return;
      }
      await context.redis.del(stateKey); // one-time use

      const record = JSON.parse(raw) as OAuthStateRecord;
      if (record.connectorId !== id) {
        reply.code(400).send({ error: "State does not match this connector" });
        return;
      }

      const connector = await context.repositories.connectors.findById(ConnectorId(id));
      if (!connector || connector.auth.type !== "oauth2" || !connector.auth.oauth) {
        reply.code(400).send({ error: `Connector "${id}" does not use OAuth2` });
        return;
      }

      const clientId = process.env[connector.auth.oauth.clientIdEnvVar];
      const clientSecret = process.env[connector.auth.oauth.clientSecretEnvVar];
      if (!clientId || !clientSecret) {
        reply.code(500).send({ error: `Connector "${id}" is missing its OAuth client configuration on the server` });
        return;
      }

      const redirectUri = new URL(`/connectors/${id}/oauth/callback`, env.OAUTH_REDIRECT_BASE_URL).toString();

      // Most providers accept client_id/client_secret as regular body fields ("body",
      // the default). A few (Reddit, Pinterest) require them as an HTTP Basic Auth
      // header instead and reject them in the body — see the `tokenAuthMethod` doc
      // comment on ConnectorAuth.oauth in packages/core-domain.
      const useBasicAuth = connector.auth.oauth.tokenAuthMethod === "basic";
      const tokenResponse = await fetch(connector.auth.oauth.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Reddit rejects/rate-limits requests without a descriptive User-Agent;
          // harmless to send to every provider.
          "User-Agent": "OmniMCP/0.1 (+https://github.com/chrystyanalexander1-hub/omnimcp)",
          ...(useBasicAuth
            ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }
            : {}),
        },
        body: new URLSearchParams({
          ...(useBasicAuth ? {} : { client_id: clientId, client_secret: clientSecret }),
          code,
          code_verifier: record.codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        reply.code(502).send({ error: `Token exchange failed: ${tokenResponse.status} ${await tokenResponse.text()}` });
        return;
      }

      const tokens = (await tokenResponse.json()) as { refresh_token?: string; access_token: string };
      if (!tokens.refresh_token) {
        reply.code(502).send({
          error:
            "The provider did not return a refresh token. Revoke this app's access in your Google account and retry the connection flow.",
        });
        return;
      }

      await context.useCases.grantConnectorCredential.execute({
        tenantId: TenantId(record.tenantId),
        connectorId: connector.id,
        grantedByUserId: UserId(record.userId),
        grantedByRole: record.role as Role,
        secret: tokens.refresh_token,
        expiresAt: null,
      });

      reply.type("text/html").send(`<!doctype html><title>Connected</title><body>${connector.displayName} is connected. You can close this tab.</body>`);
    } catch (err) {
      sendError(reply, err);
    }
  });
}
