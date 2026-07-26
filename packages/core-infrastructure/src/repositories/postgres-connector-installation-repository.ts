import { and, eq, isNull } from "drizzle-orm";
import {
  ConnectorId,
  ConnectorInstallationId,
  TenantId,
  UserId,
  type ConnectorInstallation,
} from "@omnimcp/core-domain";
import type { ConnectorInstallationRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { connectorInstallations } from "../db/schema.js";

export class PostgresConnectorInstallationRepository implements ConnectorInstallationRepository {
  constructor(private readonly db: Database) {}

  async findActive(tenantId: TenantId, connectorId: ConnectorId): Promise<ConnectorInstallation | null> {
    const [row] = await this.db
      .select()
      .from(connectorInstallations)
      .where(
        and(
          eq(connectorInstallations.tenantId, tenantId),
          eq(connectorInstallations.connectorId, connectorId),
          isNull(connectorInstallations.uninstalledAt),
        ),
      )
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async listActiveByTenant(tenantId: TenantId): Promise<ConnectorInstallation[]> {
    const rows = await this.db
      .select()
      .from(connectorInstallations)
      .where(and(eq(connectorInstallations.tenantId, tenantId), isNull(connectorInstallations.uninstalledAt)));
    return rows.map((row) => this.toEntity(row));
  }

  async save(installation: ConnectorInstallation): Promise<void> {
    await this.db
      .insert(connectorInstallations)
      .values({
        id: installation.id,
        tenantId: installation.tenantId,
        connectorId: installation.connectorId,
        installedByUserId: installation.installedByUserId,
        config: installation.config,
        installedAt: installation.installedAt,
        uninstalledAt: installation.uninstalledAt,
      })
      .onConflictDoUpdate({
        target: connectorInstallations.id,
        set: { uninstalledAt: installation.uninstalledAt },
      });
  }

  private toEntity(row: typeof connectorInstallations.$inferSelect): ConnectorInstallation {
    return Object.freeze({
      id: ConnectorInstallationId(row.id),
      tenantId: TenantId(row.tenantId),
      connectorId: ConnectorId(row.connectorId),
      installedByUserId: UserId(row.installedByUserId),
      config: Object.freeze({ ...(row.config as Record<string, unknown>) }),
      installedAt: row.installedAt,
      uninstalledAt: row.uninstalledAt,
    });
  }
}
