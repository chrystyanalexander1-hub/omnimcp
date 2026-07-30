import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { airtableRequest } from "./airtable-client.js";

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

await startConnector({
  name: "airtable",
  version: "0.1.0",
  tools: [
    {
      name: "list_records",
      description: "List records in a table.",
      inputSchema: listRecordsSchema,
      async handler({ baseId, tableName, maxRecords, filterByFormula }) {
        const { records } = await airtableRequest<{ records: unknown[] }>(baseId, tableName, "", {
          maxRecords,
          ...(filterByFormula ? { filterByFormula } : {}),
        });
        return jsonResult(records);
      },
    },
    {
      name: "create_record",
      description: "Create a new record in a table.",
      inputSchema: createRecordSchema,
      async handler({ baseId, tableName, fields }) {
        const { id } = await airtableRequest<{ id: string }>(baseId, tableName, "", { fields }, "POST");
        return jsonResult({ recordId: id });
      },
    },
    {
      name: "update_record",
      description: "Update specific fields of an existing record.",
      inputSchema: updateRecordSchema,
      async handler({ baseId, tableName, recordId, fields }) {
        const { id } = await airtableRequest<{ id: string }>(baseId, tableName, `/${recordId}`, { fields }, "PATCH");
        return jsonResult({ recordId: id });
      },
    },
    {
      name: "delete_record",
      description: "Delete a record.",
      inputSchema: deleteRecordSchema,
      async handler({ baseId, tableName, recordId }) {
        await airtableRequest(baseId, tableName, `/${recordId}`, {}, "DELETE");
        return textResult(`Record ${recordId} deleted`);
      },
    },
  ],
});
