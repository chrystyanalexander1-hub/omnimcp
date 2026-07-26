import { canManageConnectors, qualifyToolName, type Role, type TenantId, type Tool, type UserId } from "@omnimcp/core-domain";
import type {
  ConnectorInstallationRepository,
  ConnectorRepository,
  PermissionRepository,
} from "../ports/repositories.js";

export interface AvailableTool {
  readonly qualifiedName: string;
  readonly connectorId: string;
  readonly tool: Tool;
}

export interface ListAvailableToolsInput {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly role: Role;
}

/** Every tool the caller may execute right now: installed for their tenant, and either they hold an admin/owner role or have an explicit per-connector Permission. */
export class ListAvailableTools {
  constructor(
    private readonly installations: ConnectorInstallationRepository,
    private readonly connectors: ConnectorRepository,
    private readonly permissions: PermissionRepository,
  ) {}

  async execute(input: ListAvailableToolsInput): Promise<AvailableTool[]> {
    const activeInstallations = await this.installations.listActiveByTenant(input.tenantId);
    const canManage = canManageConnectors(input.role);
    const result: AvailableTool[] = [];

    for (const installation of activeInstallations) {
      if (!canManage) {
        const allowed = await this.permissions.has(input.tenantId, input.userId, installation.connectorId);
        if (!allowed) continue;
      }
      const connector = await this.connectors.findById(installation.connectorId);
      if (!connector) continue;
      for (const tool of connector.tools) {
        result.push({
          qualifiedName: qualifyToolName(connector.id, tool.name),
          connectorId: connector.id,
          tool,
        });
      }
    }
    return result;
  }
}
