import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDatabase(connectionString: string): Database {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

/**
 * Runs a callback with Postgres session variable `app.tenant_id` set for the duration
 * of the transaction, so Row-Level Security policies (see infra/migrations) enforce
 * tenant isolation even if a repository method forgets a `WHERE tenant_id = ...`
 * clause.
 */
export async function withTenantScope<T>(db: Database, tenantId: string, fn: (db: Database) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as Database);
  });
}
