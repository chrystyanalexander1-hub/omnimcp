import { errorResult, jsonResult, requireEnv, startConnector } from "@omnimcp/connector-sdk-ts";
import postgres from "postgres";
import { z } from "zod";

const listTablesSchema = z.object({});
const describeTableSchema = z.object({ tableName: z.string() });
const runQuerySchema = z.object({ sql: z.string(), params: z.array(z.unknown()).default([]) });

// A single connection, reused across calls for the lifetime of this connector
// process — this process only ever serves one tenant's own external database (see
// docs/connector-authoring-guide.md on per-tenant process pooling), so there's no
// cross-tenant sharing risk in keeping it open.
const sql = postgres(requireEnv("POSTGRES_CONNECTION_STRING"), { max: 3 });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
  }
}

await startConnector({
  name: "postgres",
  version: "0.1.0",
  tools: [
    {
      name: "list_tables",
      description: "List tables in the connected database's public schema.",
      inputSchema: listTablesSchema,
      async handler() {
        const result = await safe(
          () => sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "describe_table",
      description: "List a table's columns, types, and nullability.",
      inputSchema: describeTableSchema,
      async handler({ tableName }) {
        const result = await safe(
          () =>
            sql`select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = ${tableName} order by ordinal_position`,
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "run_query",
      description: "Run a raw SQL statement against the tenant's own database.",
      inputSchema: runQuerySchema,
      async handler({ sql: query, params }) {
        const result = await safe(() => sql.unsafe(query, params as never[]));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
  ],
});
