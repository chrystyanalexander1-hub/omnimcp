import { createHash } from "node:crypto";
import { requireEnv } from "@omnimcp/connector-sdk-ts";

export class MailchimpApiError extends Error {}

/**
 * Mailchimp API keys embed which datacenter the account lives on as a suffix, e.g.
 * "abc123def456-us6" — the API host is that suffix, not a fixed one shared by every
 * account. No separate "datacenter" field to configure: it's parsed straight out of
 * the key itself.
 */
function apiHost(apiKey: string): string {
  const dc = apiKey.split("-").pop();
  if (!dc) throw new MailchimpApiError("MAILCHIMP_API_KEY is missing its datacenter suffix, e.g. '...-us6'");
  return `https://${dc}.api.mailchimp.com/3.0`;
}

export function subscriberHash(email: string): string {
  return createHash("md5").update(email.toLowerCase()).digest("hex");
}

export async function mailchimpRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" | "PUT" = "GET",
): Promise<T> {
  const apiKey = requireEnv("MAILCHIMP_API_KEY");
  const url = new URL(`${apiHost(apiKey)}${path}`);
  const init: RequestInit = {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}` },
  };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(params);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { detail?: string; title?: string };
  if (!res.ok) {
    throw new MailchimpApiError(json.detail ?? json.title ?? `Mailchimp API error: HTTP ${res.status}`);
  }
  return json as T;
}
