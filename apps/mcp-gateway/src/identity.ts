import { isApiKeyActive, type Role, type TenantId, type UserId } from "@omnimcp/core-domain";
import type { AppContext } from "@omnimcp/core-infrastructure";

export interface CallerIdentity {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly role: Role;
}

/**
 * The gateway is a single stdio process spawned by one MCP client (Claude Desktop, or
 * any other MCP-compatible client) on behalf of one human, exactly like every other
 * local MCP server — so identity is resolved once at boot from OMNIMCP_API_KEY, not
 * per request. Multi-user, multi-session access goes through apps/rest-api instead,
 * which authenticates each HTTP request independently.
 */
export async function resolveCallerIdentity(context: AppContext): Promise<CallerIdentity> {
  const rawKey = process.env.OMNIMCP_API_KEY;
  if (!rawKey) {
    throw new Error(
      "OMNIMCP_API_KEY is not set. Generate one via the REST API (POST /api-keys) and configure it in your MCP client.",
    );
  }

  const keyHash = context.services.crypto.sha256(rawKey);
  const apiKey = await context.repositories.apiKeys.findByHash(keyHash);
  if (!apiKey || !isApiKeyActive(apiKey)) {
    throw new Error("OMNIMCP_API_KEY is invalid or has been revoked.");
  }

  const user = await context.repositories.users.findById(apiKey.createdByUserId);
  if (!user) {
    throw new Error("The user that created this API key no longer exists.");
  }

  return { tenantId: apiKey.tenantId, userId: user.id, role: user.role };
}
