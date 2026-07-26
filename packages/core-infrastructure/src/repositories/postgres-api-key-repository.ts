import { eq } from "drizzle-orm";
import { ApiKeyId, TenantId, UserId, type ApiKey } from "@omnimcp/core-domain";
import type { ApiKeyRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { apiKeys } from "../db/schema.js";

export class PostgresApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly db: Database) {}

  async findById(id: ApiKeyId): Promise<ApiKey | null> {
    const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByHash(hash: string): Promise<ApiKey | null> {
    const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async save(apiKey: ApiKey): Promise<void> {
    await this.db
      .insert(apiKeys)
      .values({
        id: apiKey.id,
        tenantId: apiKey.tenantId,
        createdByUserId: apiKey.createdByUserId,
        name: apiKey.name,
        keyHash: apiKey.keyHash,
        createdAt: apiKey.createdAt,
        revokedAt: apiKey.revokedAt,
      })
      .onConflictDoUpdate({ target: apiKeys.id, set: { revokedAt: apiKey.revokedAt } });
  }

  private toEntity(row: typeof apiKeys.$inferSelect): ApiKey {
    return Object.freeze({
      id: ApiKeyId(row.id),
      tenantId: TenantId(row.tenantId),
      createdByUserId: UserId(row.createdByUserId),
      name: row.name,
      keyHash: row.keyHash,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
    });
  }
}
