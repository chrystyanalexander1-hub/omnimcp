import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_VERSION = "2024-10";

export class ShopifyApiError extends Error {}

/**
 * Shopify's own docs recommend a Custom App Admin API access token (long-lived, no
 * expiry) for private server-to-server integrations, over the full OAuth app-install
 * flow — same rationale as GitHub's PAT. `shopDomain` is passed per-call rather than
 * stored as env config since it identifies which store a call targets, not a secret.
 */
export async function shopifyRequest<T>(
  shopDomain: string,
  path: string,
  body?: unknown,
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const token = requireEnv("SHOPIFY_ACCESS_TOKEN");
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}${path}`, {
    method,
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json()) as { errors?: unknown };
  if (!res.ok) {
    throw new ShopifyApiError(typeof json.errors === "string" ? json.errors : JSON.stringify(json.errors ?? `HTTP ${res.status}`));
  }
  return json as T;
}
