import { canManageConnectors, NotFoundError, PermissionDeniedError, type Role, type TenantId, type WorkflowId, type WorkflowRun } from "@omnimcp/core-domain";
import type { WorkflowRepository } from "../ports/repositories.js";
import type { RunWorkflow } from "./run-workflow.js";

export interface TriggerWorkflowInput {
  readonly tenantId: TenantId;
  readonly workflowId: WorkflowId;
  readonly actorRole: Role;
}

/** The authorized, on-demand counterpart to RunDueWorkflows — same execution engine (RunWorkflow), but reachable by a human clicking "run now" instead of the scheduler, so it has to check tenant ownership and role itself. */
export class TriggerWorkflow {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly runWorkflow: RunWorkflow,
  ) {}

  async execute(input: TriggerWorkflowInput): Promise<WorkflowRun> {
    if (!canManageConnectors(input.actorRole)) {
      throw new PermissionDeniedError("Only tenant owners/admins can run automations manually");
    }
    const workflow = await this.workflows.findById(input.workflowId);
    if (!workflow || workflow.tenantId !== input.tenantId) {
      throw new NotFoundError(`Unknown workflow: ${input.workflowId}`);
    }
    return this.runWorkflow.execute(workflow);
  }
}
