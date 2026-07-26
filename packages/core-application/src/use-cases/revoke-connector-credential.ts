import { canManageConnectors, NotFoundError, PermissionDeniedError, type ConnectorId, type Role, type TenantId } from "@omnimcp/core-domain";
import type { CredentialGrantRepository } from "../ports/repositories.js";
import type { Clock } from "../ports/services.js";

export interface RevokeConnectorCredentialInput {
  readonly tenantId: TenantId;
  readonly connectorId: ConnectorId;
  readonly revokedByRole: Role;
}

export class RevokeConnectorCredential {
  constructor(
    private readonly grants: CredentialGrantRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: RevokeConnectorCredentialInput): Promise<void> {
    if (!canManageConnectors(input.revokedByRole)) {
      throw new PermissionDeniedError("Only tenant owners/admins can revoke connector credentials");
    }
    const grant = await this.grants.findActive(input.tenantId, input.connectorId);
    if (!grant) {
      throw new NotFoundError(`No active credential grant for connector: ${input.connectorId}`);
    }
    await this.grants.revoke(grant.id, this.clock.now());
  }
}
