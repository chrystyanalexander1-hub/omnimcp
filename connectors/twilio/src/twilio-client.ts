import { requireEnv } from "@omnimcp/connector-sdk-ts";

export class TwilioApiError extends Error {}

/** Twilio authenticates with HTTP Basic Auth: Account SID as username, Auth Token as password — stored as a single "accountSid|authToken" secret, same pipe convention as connectors/activecampaign. */
function credentials(): { accountSid: string; authToken: string } {
  const raw = requireEnv("TWILIO_CREDENTIALS");
  const [accountSid, authToken] = raw.split("|");
  if (!accountSid || !authToken) {
    throw new TwilioApiError("TWILIO_CREDENTIALS must be formatted as 'accountSid|authToken'");
  }
  return { accountSid, authToken };
}

export async function twilioRequest<T>(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<T> {
  const { accountSid, authToken } = credentials();
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}${path}`);
  const init: RequestInit = {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
  };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/x-www-form-urlencoded" };
    init.body = new URLSearchParams(params);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { message?: string };
  if (!res.ok) {
    throw new TwilioApiError(json.message ?? `Twilio API error: HTTP ${res.status}`);
  }
  return json as T;
}
