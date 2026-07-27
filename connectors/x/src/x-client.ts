import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://api.twitter.com/2";

export class XApiError extends Error {}

export async function xRequest<T>(path: string, body?: unknown, method: "GET" | "POST" | "DELETE" = "GET"): Promise<T> {
  const token = requireEnv("X_ACCESS_TOKEN");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as { detail?: string; title?: string };
  if (!res.ok) {
    throw new XApiError(json.detail ?? json.title ?? `X API error: HTTP ${res.status}`);
  }
  return json as T;
}
