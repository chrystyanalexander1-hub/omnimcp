import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./google-auth.js";

export class GoogleAnalyticsApiError extends Error {}

const listAccountSummariesSchema = z.object({});

const runReportSchema = z.object({
  propertyId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  dimensions: z.array(z.string()).default(["date"]),
  metrics: z.array(z.string()).default(["activeUsers", "sessions"]),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof GoogleAnalyticsApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new GoogleAnalyticsApiError(json.error?.message ?? `Google Analytics API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "google-analytics",
  version: "0.1.0",
  tools: [
    {
      name: "list_account_summaries",
      description: "List GA4 accounts and properties accessible to the authenticated token.",
      inputSchema: listAccountSummariesSchema,
      async handler() {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
            headers: { Authorization: `Bearer ${token}` },
          });
          return handle<{ accountSummaries?: unknown[] }>(res);
        });
        return result.ok ? jsonResult(result.value.accountSummaries ?? []) : errorResult(result.message);
      },
    },
    {
      name: "run_report",
      description: "Run a GA4 report: dimensions x metrics over a date range.",
      inputSchema: runReportSchema,
      async handler({ propertyId, startDate, endDate, dimensions, metrics }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(
            `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                dateRanges: [{ startDate, endDate }],
                dimensions: dimensions.map((name: string) => ({ name })),
                metrics: metrics.map((name: string) => ({ name })),
              }),
            },
          );
          return handle(res);
        });
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
  ],
});
