import { and, eq, gt, isNull, or } from "drizzle-orm";
import {
  ConnectorId,
  CredentialGrantId,
  TenantId,
  UserId,
  type CredentialGrant,
} from "@omnimcp/core-domain";
import type { CredentialGrantRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { credentialGrants } from "../db/schema.js";

export class PostgresCredentialGrantRepository implements CredentialGrantRepository {
  constructor(private readonly db: Database) {}

  async findActive(tenantId: TenantId, connectorId: ConnectorId): Promise<CredentialGrant | null> {
    const now = new Date();
    const [row] = await this.db
      .select()
      .from(credentialGrants)
      .where(
        and(
          eq(credentialGrants.tenantId, tenantId),
          eq(credentialGrants.connectorId, connectorId),
          isNull(credentialGrants.revokedAt),
          or(isNull(credentialGrants.expiresAt), gt(credentialGrants.expiresAt, now)),
        ),
      )
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async save(grant: CredentialGrant): Promise<void> {
    await this.db.insert(credentialGrants).values({
      id: grant.id,
      tenantId: grant.tenantId,
      connectorId: grant.connectorId,
      grantedByUserId: grant.grantedByUserId,
      ciphertext: grant.ciphertext,
      iv: grant.iv,
      authTag: grant.authTag,
      expiresAt: grant.expiresAt,
      createdAt: grant.createdAt,
      revokedAt: grant.revokedAt,
    });
  }

  async revoke(id: CredentialGrantId, revokedAt: Date): Promise<void> {
    await this.db.update(credentialGrants).set({ revokedAt }).where(eq(credentialGrants.id, id));
  }

  async updateSecret(id: CredentialGrantId, secret: { ciphertext: string; iv: string; authTag: string }): Promise<void> {
    await this.db.update(credentialGrants).set(secret).where(eq(credentialGrants.id, id));
  }

  private toEntity(row: typeof credentialGrants.$inferSelect): CredentialGrant {
    return Object.freeze({
      id: CredentialGrantId(row.id),
      tenantId: TenantId(row.tenantId),
      connectorId: ConnectorId(row.connectorId),
      grantedByUserId: UserId(row.grantedByUserId),
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
    });
  }
}
