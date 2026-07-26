import type { FastifyInstance } from "fastify";
import { canViewAudit } from "@omnimcp/core-domain";
import type { AppContext } from "@omnimcp/core-infrastructure";
import { requireAuth } from "../auth.js";

export function registerAuditRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/audit", { preHandler: requireAuth(context) }, async (request, reply) => {
    const identity = request.identity!;
    if (!canViewAudit(identity.role)) {
      reply.code(403).send({ error: "Only tenant owners/admins can view the audit log" });
      return;
    }
    const events = await context.repositories.auditEvents.listByTenant(identity.tenantId);
    reply.send(events);
  });
}
