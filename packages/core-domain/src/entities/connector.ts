import { InvalidEntityError } from "../errors.js";
import { ConnectorId } from "../ids.js";
import type { Tool } from "./tool.js";

export type ConnectorTransport =
  | { readonly type: "stdio"; readonly command: string; readonly args: readonly string[] }
  | { readonly type: "http"; readonly baseUrl: string };

export type ConnectorAuthType = "api_key" | "oauth2" | "none";

export interface ConnectorAuth {
  readonly type: ConnectorAuthType;
  /** For api_key connectors: the env var the connector process reads the secret from. */
  readonly envVar?: string;
  /**
   * For oauth2 connectors: authorization/token endpoints and scopes, used by the REST
   * API's OAuth flow. `clientIdEnvVar`/`clientSecretEnvVar` name the env vars — set on
   * the gateway/REST API process, never per-tenant — that hold the OAuth app's own
   * client id/secret (shared across every tenant using this connector).
   */
  readonly oauth?: {
    readonly authorizationUrl: string;
    readonly tokenUrl: string;
    readonly scopes: readonly string[];
    readonly clientIdEnvVar: string;
    readonly clientSecretEnvVar: string;
    /**
     * How the token endpoint expects the client credentials. Most providers (Google,
     * Meta-style) accept `client_id`/`client_secret` as regular POST body fields —
     * that's `"body"`, the default. Some (Reddit, Pinterest) require them instead as
     * an HTTP Basic Auth header and reject them in the body; that's `"basic"`. See
     * `apps/rest-api/src/routes/oauth.ts` for where this branches.
     */
    readonly tokenAuthMethod?: "body" | "basic";
    /**
     * Extra query params merged into the authorization redirect URL, beyond the
     * standard OAuth2+PKCE ones the generic flow always sends. Exists for
     * provider-specific requirements at the authorize step, e.g. Reddit's
     * `duration=permanent` — without it Reddit issues only a 1-hour access token and
     * no refresh_token at all, regardless of what the token exchange requests later.
     */
    readonly authorizationExtraParams?: Readonly<Record<string, string>>;
    /**
     * True for providers (Mercado Libre) that invalidate the current refresh_token
     * every time it's exchanged and issue a new one in its place — most providers
     * (Google, Reddit, Pinterest, Snapchat) don't do this and reuse the same
     * refresh_token indefinitely. When true, `ConnectorProcessManager` refreshes the
     * token itself right before spawning a new pooled connection and persists the
     * newly-issued refresh_token back to the stored `CredentialGrant` — without that,
     * the very next process respawn (any idle gap, deploy, or crash) would reuse an
     * already-invalidated refresh_token and fail permanently. See
     * `packages/core-infrastructure/src/services/connector-process-manager.ts`.
     */
    readonly refreshTokenRotates?: boolean;
  };
  /**
   * Names of additional env vars — set once on the gateway process, shared across
   * every tenant, never per-tenant — that this connector's process needs verbatim.
   * Exists for platform-level static config that isn't an OAuth client id/secret,
   * e.g. Google Ads' "developer token", which every tenant's calls must present
   * alongside their own OAuth token. Most connectors don't need this.
   */
  readonly sharedEnvVars?: readonly string[];
}

/**
 * A connector as registered in the platform-wide catalog — this is the parsed,
 * validated form of a connector's `connector.manifest.json`. It is NOT tenant data;
 * see ConnectorInstallation for the per-tenant activation record.
 */
export interface Connector {
  readonly id: ConnectorId;
  readonly displayName: string;
  readonly version: string;
  readonly transport: ConnectorTransport;
  readonly auth: ConnectorAuth;
  readonly tools: readonly Tool[];
}

export function createConnector(input: {
  id: ConnectorId;
  displayName: string;
  version: string;
  transport: ConnectorTransport;
  auth: ConnectorAuth;
  tools: readonly Tool[];
}): Connector {
  if (input.tools.length === 0) {
    throw new InvalidEntityError(`Connector ${input.id} must declare at least one tool`);
  }
  const seen = new Set<string>();
  for (const tool of input.tools) {
    if (seen.has(tool.name)) {
      throw new InvalidEntityError(`Connector ${input.id} declares duplicate tool "${tool.name}"`);
    }
    seen.add(tool.name);
  }
  return Object.freeze({ ...input, tools: Object.freeze([...input.tools]) });
}

export function findTool(connector: Connector, toolName: string): Tool | undefined {
  return connector.tools.find((t) => t.name === toolName);
}
