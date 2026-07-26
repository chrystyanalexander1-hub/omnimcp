import type { FastifyInstance } from "fastify";
import type { AppContext } from "@omnimcp/core-infrastructure";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { sendError } from "../error-handler.js";

const issueApiKeyBody = z.object({ name: z.string().min(1) });

export function registerApiKeyRoutes(app: FastifyInstance, context: AppContext): void {
  app.post("/api-keys", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const body = issueApiKeyBody.parse(request.body);
      const identity = request.identity!;
      const { apiKey, rawKey } = await context.useCases.issueApiKey.execute({
        tenantId: identity.tenantId,
        createdByUserId: identity.userId,
        name: body.name,
      });
      // rawKey is shown exactly once here — the server never stores or re-displays it.
      reply.code(201).send({ id: apiKey.id, name: apiKey.name, key: rawKey, createdAt: apiKey.createdAt });
    } catch (err) {
      sendError(reply, err);
    }
  });
}
