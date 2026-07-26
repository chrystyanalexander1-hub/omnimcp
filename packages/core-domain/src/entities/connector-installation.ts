import { ConnectorId, ConnectorInstallationId, TenantId, UserId } from "../ids.js";

/**
 * Records that a tenant has activated a connector. Installing a connector does not
 * by itself grant credentials — that's a separate CredentialGrant — so an admin can
 * install a connector for the team before anyone has connected an account.
 */
export interface ConnectorInstallation {
  readonly id: ConnectorInstallationId;
  readonly tenantId: TenantId;
  readonly connectorId: ConnectorId;
  readonly installedByUserId: UserId;
  readonly config: Readonly<Record<string, unknown>>;
  readonly installedAt: Date;
  readonly uninstalledAt: Date | null;
}

export function isConnectorInstallationActive(installation: ConnectorInstallation): boolean {
  return installation.uninstalledAt === null;
}
