import type { FastifyInstance } from "fastify";
import { ConnectorId } from "@omnimcp/core-domain";
import type { AppContext } from "@omnimcp/core-infrastructure";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { sendError } from "../error-handler.js";

const installBody = z.object({ config: z.record(z.unknown()).optional() });
const grantCredentialBody = z.object({ secret: z.string().min(1), expiresAt: z.string().datetime().optional() });

export function registerConnectorRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/connectors", { preHandler: requireAuth(context) }, async (_request, reply) => {
    const connectors = await context.repositories.connectors.list();
    reply.send(
      connectors.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        version: c.version,
        authType: c.auth.type,
        tools: c.tools.map((t) => ({ name: t.name, description: t.description, sensitive: t.sensitive })),
      })),
    );
  });

  app.post("/connectors/:id/install", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = installBody.parse(request.body ?? {});
      const identity = request.identity!;
      const installation = await context.useCases.installConnector.execute({
        tenantId: identity.tenantId,
        connectorId: ConnectorId(id),
        installedByUserId: identity.userId,
        installedByRole: identity.role,
        ...(body.config !== undefined ? { config: body.config } : {}),
      });
      reply.code(201).send({ id: installation.id, installedAt: installation.installedAt });
    } catch (err) {
      sendError(reply, err);
    }
  });

  app.post("/connectors/:id/credentials", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = grantCredentialBody.parse(request.body);
      const identity = request.identity!;
      const grant = await context.useCases.grantConnectorCredential.execute({
        tenantId: identity.tenantId,
        connectorId: ConnectorId(id),
        grantedByUserId: identity.userId,
        grantedByRole: identity.role,
        secret: body.secret,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });
      // Confirms the grant was stored without ever echoing the secret back.
      reply.code(201).send({ id: grant.id, connectorId: grant.connectorId, createdAt: grant.createdAt });
    } catch (err) {
      sendError(reply, err);
    }
  });

  app.delete("/connectors/:id/credentials", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const identity = request.identity!;
      await context.useCases.revokeConnectorCredential.execute({
        tenantId: identity.tenantId,
        connectorId: ConnectorId(id),
        revokedByRole: identity.role,
      });
      reply.code(204).send();
    } catch (err) {
      sendError(reply, err);
    }
  });
}
