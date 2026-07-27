import { requireEnv } from "@omnimcp/connector-sdk-ts";
import { getAccessToken } from "./google-auth.js";

const API_VERSION = "v17";
const API_BASE = `https://googleads.googleapis.com/${API_VERSION}`;

export class GoogleAdsApiError extends Error {}

async function authHeaders(): Promise<Record<string, string>> {
  const accessToken = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": requireEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json",
  };
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  return headers;
}

interface GoogleAdsErrorBody {
  error?: {
    message?: string;
    details?: Array<{ errors?: Array<{ message?: string }> }>;
  };
}

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as GoogleAdsErrorBody & T;
  if (!res.ok) {
    const nestedMessage = json.error?.details?.[0]?.errors?.[0]?.message;
    const message = nestedMessage ?? json.error?.message ?? `Google Ads API error: HTTP ${res.status}`;
    throw new GoogleAdsApiError(message);
  }
  return json as T;
}

export async function listAccessibleCustomers(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/customers:listAccessibleCustomers`, { headers: await authHeaders() });
  const json = await handle<{ resourceNames: string[] }>(res);
  return json.resourceNames;
}

export async function searchGaql(customerId: string, query: string): Promise<unknown[]> {
  const res = await fetch(`${API_BASE}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ query }),
  });
  const json = await handle<{ results?: unknown[] }>(res);
  return json.results ?? [];
}

export async function mutate(customerId: string, resource: string, operations: unknown[]): Promise<unknown> {
  const res = await fetch(`${API_BASE}/customers/${customerId}/${resource}:mutate`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ operations }),
  });
  return handle(res);
}
