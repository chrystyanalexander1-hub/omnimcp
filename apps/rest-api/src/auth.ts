import type { FastifyReply, FastifyRequest } from "fastify";
import { isApiKeyActive, type Role, type TenantId, type UserId } from "@omnimcp/core-domain";
import type { AppContext } from "@omnimcp/core-infrastructure";

export interface RequestIdentity {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    identity?: RequestIdentity;
  }
}

/**
 * Accepts either a short-lived JWT access token (issued by /auth/login, used by the
 * web panel / mobile apps) or a long-lived API key (issued by POST /api-keys, used by
 * SDKs and scripts) in the Authorization header — both resolve to the same
 * RequestIdentity shape so route handlers never need to know which one was used.
 */
export function requireAuth(context: AppContext) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      await reply.code(401).send({ error: "Missing Authorization: Bearer <token> header" });
      return;
    }
    const token = header.slice("Bearer ".length);

    try {
      const claims = context.services.tokens.verifyAccessToken(token);
      request.identity = {
        tenantId: claims.tenantId as TenantId,
        userId: claims.userId as UserId,
        role: claims.role as Role,
      };
      return;
    } catch {
      // Not a valid JWT — fall through and try it as an API key.
    }

    const keyHash = context.services.crypto.sha256(token);
    const apiKey = await context.repositories.apiKeys.findByHash(keyHash);
    if (!apiKey || !isApiKeyActive(apiKey)) {
      await reply.code(401).send({ error: "Invalid or revoked credentials" });
      return;
    }
    const user = await context.repositories.users.findById(apiKey.createdByUserId);
    if (!user) {
      await reply.code(401).send({ error: "Invalid or revoked credentials" });
      return;
    }
    request.identity = { tenantId: apiKey.tenantId, userId: user.id, role: user.role };
  };
}
