import { requireEnv } from "@omnimcp/connector-sdk-ts";

export class WooCommerceApiError extends Error {}

/**
 * WooCommerce's REST API v3 recommends HTTP Basic Auth over HTTPS (consumer key as
 * username, consumer secret as password) instead of the query-string signing it falls
 * back to for non-HTTPS stores — every store we talk to is assumed to be HTTPS, so we
 * only implement that simpler path. The credential is stored as a single
 * "consumerKey:consumerSecret" secret, same pattern as connectors/trello's "key:token".
 */
function authHeader(): string {
  const raw = requireEnv("WOOCOMMERCE_CREDENTIALS");
  return `Basic ${Buffer.from(raw, "utf-8").toString("base64")}`;
}

export async function wooRequest<T>(
  storeUrl: string,
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" | "PUT" = "GET",
): Promise<T> {
  const url = new URL(`/wp-json/wc/v3/${path}`, storeUrl);
  const init: RequestInit = { method, headers: { Authorization: authHeader() } };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(params);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { message?: string };
  if (!res.ok) {
    throw new WooCommerceApiError(json.message ?? `WooCommerce API error: HTTP ${res.status}`);
  }
  return json as T;
}
