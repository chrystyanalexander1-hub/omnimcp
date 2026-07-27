import { requireEnv } from "@omnimcp/connector-sdk-ts";

export class AirtableApiError extends Error {}

export async function airtableRequest<T>(
  baseId: string,
  tableName: string,
  path = "",
  params: Record<string, unknown> = {},
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
): Promise<T> {
  const apiKey = requireEnv("AIRTABLE_API_KEY");
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}${path}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${apiKey}` } };

  if (method === "GET" || method === "DELETE") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(params);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { error?: { message?: string } | string };
  if (!res.ok) {
    const message = typeof json.error === "string" ? json.error : json.error?.message;
    throw new AirtableApiError(message ?? `Airtable API error: HTTP ${res.status}`);
  }
  return json as T;
}
