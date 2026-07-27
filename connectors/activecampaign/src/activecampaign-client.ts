import { requireEnv } from "@omnimcp/connector-sdk-ts";

export class ActiveCampaignApiError extends Error {}

/**
 * ActiveCampaign's API needs two values, not one: an account-specific base URL
 * (e.g. https://youraccountname.api-us1.com — there's no shared host like
 * Mailchimp's datacenter suffix) plus the API key. Stored as a single secret
 * "apiUrl|apiKey" — pipe-delimited rather than Trello's "key:token" colon
 * convention because the URL itself contains colons (the https:// scheme).
 */
function credentials(): { apiUrl: string; apiKey: string } {
  const raw = requireEnv("ACTIVECAMPAIGN_CREDENTIALS");
  const [apiUrl, apiKey] = raw.split("|");
  if (!apiUrl || !apiKey) {
    throw new ActiveCampaignApiError("ACTIVECAMPAIGN_CREDENTIALS must be formatted as 'apiUrl|apiKey'");
  }
  return { apiUrl: apiUrl.replace(/\/$/, ""), apiKey };
}

export async function acRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const { apiUrl, apiKey } = credentials();
  const url = new URL(`${apiUrl}/api/3${path}`);
  const init: RequestInit = { method, headers: { "Api-Token": apiKey } };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(params);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { message?: string; errors?: Array<{ title?: string }> };
  if (!res.ok) {
    throw new ActiveCampaignApiError(json.message ?? json.errors?.[0]?.title ?? `ActiveCampaign API error: HTTP ${res.status}`);
  }
  return json as T;
}
