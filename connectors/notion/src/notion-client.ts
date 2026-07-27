import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionApiError extends Error {}

export async function notionRequest<T>(path: string, body?: unknown, method: "GET" | "POST" | "PATCH" = "GET"): Promise<T> {
  const token = requireEnv("NOTION_ACCESS_TOKEN");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as { message?: string };
  if (!res.ok) {
    throw new NotionApiError(json.message ?? `Notion API error: HTTP ${res.status}`);
  }
  return json as T;
}
