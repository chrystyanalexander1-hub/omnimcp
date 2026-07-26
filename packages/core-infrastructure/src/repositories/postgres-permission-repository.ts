import { and, eq } from "drizzle-orm";
import { ConnectorId, TenantId, UserId, type Permission } from "@omnimcp/core-domain";
import type { PermissionRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { permissions } from "../db/schema.js";

export class PostgresPermissionRepository implements PermissionRepository {
  constructor(private readonly db: Database) {}

  async has(tenantId: TenantId, userId: UserId, connectorId: ConnectorId): Promise<boolean> {
    const [row] = await this.db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.tenantId, tenantId),
          eq(permissions.userId, userId),
          eq(permissions.connectorId, connectorId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async grant(permission: Permission): Promise<void> {
    await this.db
      .insert(permissions)
      .values({
        tenantId: permission.tenantId,
        userId: permission.userId,
        connectorId: permission.connectorId,
        grantedByUserId: permission.grantedByUserId,
        grantedAt: permission.grantedAt,
      })
      .onConflictDoNothing();
  }

  async revoke(tenantId: TenantId, userId: UserId, connectorId: ConnectorId): Promise<void> {
    await this.db
      .delete(permissions)
      .where(
        and(
          eq(permissions.tenantId, tenantId),
          eq(permissions.userId, userId),
          eq(permissions.connectorId, connectorId),
        ),
      );
  }
}
