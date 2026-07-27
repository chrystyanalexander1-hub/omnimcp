import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { AirtableApiError, airtableRequest } from "./airtable-client.js";

const listRecordsSchema = z.object({
  baseId: z.string(),
  tableName: z.string(),
  maxRecords: z.number().default(20),
  filterByFormula: z.string().optional(),
});
const createRecordSchema = z.object({ baseId: z.string(), tableName: z.string(), fields: z.record(z.unknown()) });
const updateRecordSchema = z.object({
  baseId: z.string(),
  tableName: z.string(),
  recordId: z.string(),
  fields: z.record(z.unknown()),
});
const deleteRecordSchema = z.object({ baseId: z.string(), tableName: z.string(), recordId: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof AirtableApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "airtable",
  version: "0.1.0",
  tools: [
    {
      name: "list_records",
      description: "List records in a table.",
      inputSchema: listRecordsSchema,
      async handler({ baseId, tableName, maxRecords, filterByFormula }) {
        const result = await safe(() =>
          airtableRequest<{ records: unknown[] }>(baseId, tableName, "", {
            maxRecords,
            ...(filterByFormula ? { filterByFormula } : {}),
          }),
        );
        return result.ok ? jsonResult(result.value.records) : errorResult(result.message);
      },
    },
    {
      name: "create_record",
      description: "Create a new record in a table.",
      inputSchema: createRecordSchema,
      async handler({ baseId, tableName, fields }) {
        const result = await safe(() =>
          airtableRequest<{ id: string }>(baseId, tableName, "", { fields }, "POST"),
        );
        return result.ok ? jsonResult({ recordId: result.value.id }) : errorResult(result.message);
      },
    },
    {
      name: "update_record",
      description: "Update specific fields of an existing record.",
      inputSchema: updateRecordSchema,
      async handler({ baseId, tableName, recordId, fields }) {
        const result = await safe(() =>
          airtableRequest<{ id: string }>(baseId, tableName, `/${recordId}`, { fields }, "PATCH"),
        );
        return result.ok ? jsonResult({ recordId: result.value.id }) : errorResult(result.message);
      },
    },
    {
      name: "delete_record",
      description: "Delete a record.",
      inputSchema: deleteRecordSchema,
      async handler({ baseId, tableName, recordId }) {
        const result = await safe(() => airtableRequest(baseId, tableName, `/${recordId}`, {}, "DELETE"));
        return result.ok ? textResult(`Record ${recordId} deleted`) : errorResult(result.message);
      },
    },
  ],
});
