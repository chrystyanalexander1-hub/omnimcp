import type { TenantId, Workflow } from "@omnimcp/core-domain";
import type { WorkflowRepository } from "../ports/repositories.js";

export class ListWorkflows {
  constructor(private readonly workflows: WorkflowRepository) {}

  async execute(tenantId: TenantId): Promise<Workflow[]> {
    return this.workflows.listByTenant(tenantId);
  }
}
