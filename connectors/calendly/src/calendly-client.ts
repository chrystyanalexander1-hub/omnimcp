import { requireEnv } from "@omnimcp/connector-sdk-ts";

const CALENDLY_API = "https://api.calendly.com";

export class CalendlyApiError extends Error {}

export async function calendlyRequest<T>(
  path: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const apiKey = requireEnv("CALENDLY_API_KEY");
  const url = new URL(`${CALENDLY_API}${path}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${apiKey}` } };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(params);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { message?: string; title?: string };
  if (!res.ok) {
    throw new CalendlyApiError(json.message ?? json.title ?? `Calendly API error: HTTP ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return json as T;
}
