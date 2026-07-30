import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
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
        const token = await getAccessToken();
        const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const { values } = await handle<{ values?: unknown[][] }>(res);
        return jsonResult(values ?? []);
      },
    },
    {
      name: "append_values",
      description: "Append rows after the last row with data in the range.",
      inputSchema: appendValuesSchema,
      async handler({ spreadsheetId, range, values }) {
        const token = await getAccessToken();
        const url = new URL(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append`);
        url.searchParams.set("valueInputOption", "USER_ENTERED");
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        });
        const { updates } = await handle<{ updates?: { updatedRange?: string } }>(res);
        return textResult(`Appended to ${updates?.updatedRange ?? range}`);
      },
    },
    {
      name: "update_values",
      description: "Overwrite the cells in a range with new values.",
      inputSchema: updateValuesSchema,
      async handler({ spreadsheetId, range, values }) {
        const token = await getAccessToken();
        const url = new URL(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`);
        url.searchParams.set("valueInputOption", "USER_ENTERED");
        const res = await fetch(url, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values }),
        });
        const { updatedRange } = await handle<{ updatedRange?: string }>(res);
        return textResult(`Updated ${updatedRange ?? range}`);
      },
    },
  ],
});
