import { ConnectorId, TenantId, UserId } from "../ids.js";

/**
 * Explicit per-member grant to execute a connector's tools. Owners/admins can always
 * execute any installed connector (see canManageConnectors); this entity is what lets
 * an admin extend that ability to a "member" without promoting their role.
 */
export interface Permission {
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly connectorId: ConnectorId;
  readonly grantedByUserId: UserId;
  readonly grantedAt: Date;
}

export function permissionKey(tenantId: TenantId, userId: UserId, connectorId: ConnectorId): string {
  return `${tenantId}:${userId}:${connectorId}`;
}
