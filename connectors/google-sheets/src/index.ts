import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./google-auth.js";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export class GoogleSheetsApiError extends Error {}

const getValuesSchema = z.object({ spreadsheetId: z.string(), range: z.string() });
const appendValuesSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string(),
  values: z.array(z.array(z.unknown())),
});
const updateValuesSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string(),
  values: z.array(z.array(z.unknown())),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof GoogleSheetsApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new GoogleSheetsApiError(json.error?.message ?? `Google Sheets API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "google-sheets",
  version: "0.1.0",
  tools: [
    {
      name: "get_values",
      description: "Read a range of cell values from a spreadsheet.",
      inputSchema: getValuesSchema,
      async handler({ spreadsheetId, range }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return handle<{ values?: unknown[][] }>(res);
        });
        return result.ok ? jsonResult(result.value.values ?? []) : errorResult(result.message);
      },
    },
    {
      name: "append_values",
      description: "Append rows after the last row with data in the range.",
      inputSchema: appendValuesSchema,
      async handler({ spreadsheetId, range, values }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const url = new URL(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append`);
          url.searchParams.set("valueInputOption", "USER_ENTERED");
          const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values }),
          });
          return handle<{ updates?: { updatedRange?: string } }>(res);
        });
        return result.ok ? textResult(`Appended to ${result.value.updates?.updatedRange ?? range}`) : errorResult(result.message);
      },
    },
    {
      name: "update_values",
      description: "Overwrite the cells in a range with new values.",
      inputSchema: updateValuesSchema,
      async handler({ spreadsheetId, range, values }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const url = new URL(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`);
          url.searchParams.set("valueInputOption", "USER_ENTERED");
          const res = await fetch(url, {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values }),
          });
          return handle<{ updatedRange?: string }>(res);
        });
        return result.ok ? textResult(`Updated ${result.value.updatedRange ?? range}`) : errorResult(result.message);
      },
    },
  ],
});
