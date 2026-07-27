import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://api.stripe.com/v1";

export class StripeApiError extends Error {}

/** Stripe's REST API takes form-urlencoded bodies (not JSON) for writes, and Bearer-auths with the secret key directly — no separate token exchange. */
export async function stripeRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const secretKey = requireEnv("STRIPE_SECRET_KEY");
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${secretKey}` } };

  let url = `${API_BASE}${path}`;
  if (method === "GET") {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    if (query) url += `?${query}`;
  } else {
    init.body = new URLSearchParams(params as Record<string, string>);
    init.headers = { ...init.headers, "Content-Type": "application/x-www-form-urlencoded" };
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok) {
    throw new StripeApiError(json.error?.message ?? `Stripe API error: HTTP ${res.status}`);
  }
  return json as T;
}
