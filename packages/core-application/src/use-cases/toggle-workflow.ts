import { canManageConnectors, NotFoundError, PermissionDeniedError, type Role, type TenantId, type WorkflowId } from "@omnimcp/core-domain";
import type { WorkflowRepository } from "../ports/repositories.js";

export interface ToggleWorkflowInput {
  readonly tenantId: TenantId;
  readonly workflowId: WorkflowId;
  readonly actorRole: Role;
  readonly enabled: boolean;
}

export class ToggleWorkflow {
  constructor(private readonly workflows: WorkflowRepository) {}

  async execute(input: ToggleWorkflowInput): Promise<void> {
    if (!canManageConnectors(input.actorRole)) {
      throw new PermissionDeniedError("Only tenant owners/admins can enable/disable automations");
    }
    const workflow = await this.workflows.findById(input.workflowId);
    if (!workflow || workflow.tenantId !== input.tenantId) {
      throw new NotFoundError(`Unknown workflow: ${input.workflowId}`);
    }
    await this.workflows.save({ ...workflow, enabled: input.enabled });
  }
}
