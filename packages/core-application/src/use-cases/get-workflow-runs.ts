import { canManageConnectors, NotFoundError, PermissionDeniedError, type Role, type TenantId, type WorkflowId, type WorkflowRun } from "@omnimcp/core-domain";
import type { WorkflowRepository, WorkflowRunRepository } from "../ports/repositories.js";

export interface GetWorkflowRunsInput {
  readonly tenantId: TenantId;
  readonly workflowId: WorkflowId;
  readonly actorRole: Role;
}

export class GetWorkflowRuns {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly workflowRuns: WorkflowRunRepository,
  ) {}

  async execute(input: GetWorkflowRunsInput): Promise<WorkflowRun[]> {
    if (!canManageConnectors(input.actorRole)) {
      throw new PermissionDeniedError("Only tenant owners/admins can view automation run history");
    }
    const workflow = await this.workflows.findById(input.workflowId);
    if (!workflow || workflow.tenantId !== input.tenantId) {
      throw new NotFoundError(`Unknown workflow: ${input.workflowId}`);
    }
    return this.workflowRuns.listByWorkflow(input.workflowId);
  }
}
