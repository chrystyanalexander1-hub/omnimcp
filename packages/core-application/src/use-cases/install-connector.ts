import {
  canManageConnectors,
  ConnectorInstallationId,
  NotFoundError,
  PermissionDeniedError,
  type ConnectorId,
  type ConnectorInstallation,
  type Role,
  type TenantId,
  type UserId,
} from "@omnimcp/core-domain";
import type { ConnectorInstallationRepository, ConnectorRepository } from "../ports/repositories.js";
import type { Clock, IdGenerator } from "../ports/services.js";

export interface InstallConnectorInput {
  readonly tenantId: TenantId;
  readonly connectorId: ConnectorId;
  readonly installedByUserId: UserId;
  readonly installedByRole: Role;
  readonly config?: Record<string, unknown>;
}

export class InstallConnector {
  constructor(
    private readonly connectors: ConnectorRepository,
    private readonly installations: ConnectorInstallationRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: InstallConnectorInput): Promise<ConnectorInstallation> {
    if (!canManageConnectors(input.installedByRole)) {
      throw new PermissionDeniedError("Only tenant owners/admins can install connectors");
    }
    const connector = await this.connectors.findById(input.connectorId);
    if (!connector) {
      throw new NotFoundError(`Unknown connector: ${input.connectorId}`);
    }
    const installation: ConnectorInstallation = Object.freeze({
      id: ConnectorInstallationId(this.ids.newId()),
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      installedByUserId: input.installedByUserId,
      config: Object.freeze({ ...(input.config ?? {}) }),
      installedAt: this.clock.now(),
      uninstalledAt: null,
    });
    await this.installations.save(installation);
    return installation;
  }
}
