import type { FastifyInstance } from "fastify";
import type { AppContext } from "@omnimcp/core-infrastructure";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { sendError } from "../error-handler.js";

const executeToolBody = z.object({
  qualifiedToolName: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  confirmationToken: z.string().optional(),
});

export function registerToolRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/tools", { preHandler: requireAuth(context) }, async (request, reply) => {
    const identity = request.identity!;
    const tools = await context.useCases.listAvailableTools.execute(identity);
    reply.send(
      tools.map((t) => ({
        name: t.qualifiedName,
        sensitive: t.tool.sensitive,
        description: t.tool.description,
        inputSchema: t.tool.inputSchema,
      })),
    );
  });

  app.post("/tools/execute", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const body = executeToolBody.parse(request.body);
      const identity = request.identity!;
      const result = await context.useCases.executeTool.execute({
        tenantId: identity.tenantId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        qualifiedToolName: body.qualifiedToolName,
        params: body.params,
        confirmationToken: body.confirmationToken ?? null,
      });
      reply.send(result);
    } catch (err) {
      sendError(reply, err);
    }
  });
}
