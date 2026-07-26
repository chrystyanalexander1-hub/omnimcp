import { eq } from "drizzle-orm";
import { SessionId, TenantId, UserId, type Session } from "@omnimcp/core-domain";
import type { SessionRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { sessions } from "../db/schema.js";

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async findById(id: SessionId): Promise<Session | null> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByRefreshTokenHash(hash: string): Promise<Session | null> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.refreshTokenHash, hash)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async save(session: Session): Promise<void> {
    await this.db
      .insert(sessions)
      .values({
        id: session.id,
        userId: session.userId,
        tenantId: session.tenantId,
        refreshTokenHash: session.refreshTokenHash,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      })
      .onConflictDoUpdate({ target: sessions.id, set: { revokedAt: session.revokedAt } });
  }

  private toEntity(row: typeof sessions.$inferSelect): Session {
    return Object.freeze({
      id: SessionId(row.id),
      userId: UserId(row.userId),
      tenantId: TenantId(row.tenantId),
      refreshTokenHash: row.refreshTokenHash,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    });
  }
}
