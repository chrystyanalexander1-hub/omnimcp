import { errorResult, jsonResult, requireEnv, startConnector } from "@omnimcp/connector-sdk-ts";
import { MongoClient } from "mongodb";
import { z } from "zod";

const listCollectionsSchema = z.object({ database: z.string() });
const findDocumentsSchema = z.object({
  database: z.string(),
  collection: z.string(),
  filter: z.record(z.unknown()).default({}),
  limit: z.number().default(20),
});
const runCommandSchema = z.object({ database: z.string(), command: z.record(z.unknown()) });

// One client for the lifetime of this connector process, which — same as
// connectors/postgres — only ever serves one tenant's own external database (see
// ConnectorProcessManager's per-tenant-per-connector pooling), so keeping it open is safe.
const client = new MongoClient(requireEnv("MONGODB_CONNECTION_STRING"));

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
  }
}

await startConnector({
  name: "mongodb",
  version: "0.1.0",
  tools: [
    {
      name: "list_collections",
      description: "List collections in a database.",
      inputSchema: listCollectionsSchema,
      async handler({ database }) {
        const result = await safe(async () => {
          const collections = await client.db(database).listCollections().toArray();
          return collections.map((c) => c.name);
        });
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "find_documents",
      description: "Find documents in a collection matching an optional filter.",
      inputSchema: findDocumentsSchema,
      async handler({ database, collection, filter, limit }) {
        const result = await safe(() => client.db(database).collection(collection).find(filter).limit(limit).toArray());
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "run_command",
      description: "Run a raw MongoDB database command against the tenant's own database.",
      inputSchema: runCommandSchema,
      async handler({ database, command }) {
        const result = await safe(() => client.db(database).command(command));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
  ],
});
