import { eq } from "drizzle-orm";
import { TenantId, type Tenant, type TenantPlan } from "@omnimcp/core-domain";
import type { TenantRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { tenants } from "../db/schema.js";

export class PostgresTenantRepository implements TenantRepository {
  constructor(private readonly db: Database) {}

  async findById(id: TenantId): Promise<Tenant | null> {
    const [row] = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async save(tenant: Tenant): Promise<void> {
    await this.db
      .insert(tenants)
      .values({ id: tenant.id, name: tenant.name, plan: tenant.plan, createdAt: tenant.createdAt })
      .onConflictDoUpdate({
        target: tenants.id,
        set: { name: tenant.name, plan: tenant.plan },
      });
  }

  private toEntity(row: typeof tenants.$inferSelect): Tenant {
    return Object.freeze({
      id: TenantId(row.id),
      name: row.name,
      plan: row.plan as TenantPlan,
      createdAt: row.createdAt,
    });
  }
}
