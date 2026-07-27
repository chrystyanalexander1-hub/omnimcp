import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://api.trello.com/1";

export class TrelloApiError extends Error {}

/** Trello authenticates via `key` and `token` query params rather than a header — the granted credential is stored as a single "key:token" string and split here. */
function credentials(): { key: string; token: string } {
  const raw = requireEnv("TRELLO_KEY_AND_TOKEN");
  const [key, token] = raw.split(":");
  if (!key || !token) {
    throw new TrelloApiError('TRELLO_KEY_AND_TOKEN must be in the form "apiKey:apiToken"');
  }
  return { key, token };
}

export async function trelloRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const { key, token } = credentials();
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, { method });
  const json = await res.json();
  if (!res.ok) {
    throw new TrelloApiError(typeof json === "string" ? json : `Trello API error: HTTP ${res.status}`);
  }
  return json as T;
}
