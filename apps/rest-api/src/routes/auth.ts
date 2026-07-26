import type { FastifyInstance } from "fastify";
import { TenantId } from "@omnimcp/core-domain";
import type { AppContext } from "@omnimcp/core-infrastructure";
import { z } from "zod";
import { sendError } from "../error-handler.js";

const registerTenantBody = z.object({
  tenantName: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(10),
});

const loginBody = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance, context: AppContext): void {
  app.post("/tenants", async (request, reply) => {
    try {
      const body = registerTenantBody.parse(request.body);
      const { tenant, owner } = await context.useCases.registerTenant.execute(body);
      reply.code(201).send({ tenantId: tenant.id, ownerId: owner.id });
    } catch (err) {
      sendError(reply, err);
    }
  });

  app.post("/auth/login", async (request, reply) => {
    try {
      const body = loginBody.parse(request.body);
      const result = await context.useCases.authenticateUser.execute({
        tenantId: TenantId(body.tenantId),
        email: body.email,
        password: body.password,
      });
      reply.send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: { id: result.user.id, email: result.user.email, role: result.user.role },
      });
    } catch (err) {
      sendError(reply, err);
    }
  });
}
