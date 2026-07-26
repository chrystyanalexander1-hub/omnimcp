import { and, eq } from "drizzle-orm";
import { TenantId, UserId, type Role, type User } from "@omnimcp/core-domain";
import type { UserRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { users } from "../db/schema.js";

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: UserId): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(tenantId: TenantId, email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, email)))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async save(user: User): Promise<void> {
    await this.db
      .insert(users)
      .values({
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        createdAt: user.createdAt,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: user.email, passwordHash: user.passwordHash, role: user.role },
      });
  }

  private toEntity(row: typeof users.$inferSelect): User {
    return Object.freeze({
      id: UserId(row.id),
      tenantId: TenantId(row.tenantId),
      email: row.email,
      passwordHash: row.passwordHash,
      role: row.role as Role,
      createdAt: row.createdAt,
    });
  }
}
