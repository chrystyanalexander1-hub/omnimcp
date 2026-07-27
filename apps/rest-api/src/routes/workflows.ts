import type { FastifyInstance } from "fastify";
import { WorkflowId } from "@omnimcp/core-domain";
import type { AppContext } from "@omnimcp/core-infrastructure";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { sendError } from "../error-handler.js";

const stepBody = z.object({
  qualifiedToolName: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  runIf: z.enum(["always", "previous_success", "previous_failure"]).optional(),
  confirmSensitive: z.boolean().optional(),
});

const createWorkflowBody = z.object({
  name: z.string().min(2),
  cronExpression: z.string().optional(),
  steps: z.array(stepBody).min(1),
});

const toggleWorkflowBody = z.object({ enabled: z.boolean() });

export function registerWorkflowRoutes(app: FastifyInstance, context: AppContext): void {
  app.post("/workflows", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const body = createWorkflowBody.parse(request.body);
      const identity = request.identity!;
      const workflow = await context.useCases.createWorkflow.execute({
        tenantId: identity.tenantId,
        createdByUserId: identity.userId,
        createdByRole: identity.role,
        name: body.name,
        cronExpression: body.cronExpression ?? null,
        steps: body.steps.map((s) => ({
          qualifiedToolName: s.qualifiedToolName,
          params: s.params,
          ...(s.runIf !== undefined ? { runIf: s.runIf } : {}),
          ...(s.confirmSensitive !== undefined ? { confirmSensitive: s.confirmSensitive } : {}),
        })),
      });
      reply.code(201).send(workflow);
    } catch (err) {
      sendError(reply, err);
    }
  });

  app.get("/workflows", { preHandler: requireAuth(context) }, async (request, reply) => {
    const identity = request.identity!;
    const workflows = await context.useCases.listWorkflows.execute(identity.tenantId);
    reply.send(workflows);
  });

  app.get("/workflows/:id/runs", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const identity = request.identity!;
      const runs = await context.useCases.getWorkflowRuns.execute({
        tenantId: identity.tenantId,
        workflowId: WorkflowId(id),
        actorRole: identity.role,
      });
      reply.send(runs);
    } catch (err) {
      sendError(reply, err);
    }
  });

  app.post("/workflows/:id/run", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const identity = request.identity!;
      const run = await context.useCases.triggerWorkflow.execute({
        tenantId: identity.tenantId,
        workflowId: WorkflowId(id),
        actorRole: identity.role,
      });
      reply.send(run);
    } catch (err) {
      sendError(reply, err);
    }
  });

  app.patch("/workflows/:id", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = toggleWorkflowBody.parse(request.body);
      const identity = request.identity!;
      await context.useCases.toggleWorkflow.execute({
        tenantId: identity.tenantId,
        workflowId: WorkflowId(id),
        actorRole: identity.role,
        enabled: body.enabled,
      });
      reply.code(204).send();
    } catch (err) {
      sendError(reply, err);
    }
  });

  app.delete("/workflows/:id", { preHandler: requireAuth(context) }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const identity = request.identity!;
      await context.useCases.deleteWorkflow.execute({
        tenantId: identity.tenantId,
        workflowId: WorkflowId(id),
        actorRole: identity.role,
      });
      reply.code(204).send();
    } catch (err) {
      sendError(reply, err);
    }
  });
}
