import { requireEnv } from "@omnimcp/connector-sdk-ts";

const KLAVIYO_API = "https://a.klaviyo.com/api";

// Klaviyo requires a `revision` header pinning the API version you coded against —
// it isn't optional, and Klaviyo periodically retires old revisions. If requests
// start failing with a revision error, bump this to a revision Klaviyo currently
// documents at https://developers.klaviyo.com/en/docs/api_versioning_and_deprecation.
const KLAVIYO_REVISION = "2024-10-15";

export class KlaviyoApiError extends Error {}

export async function klaviyoRequest<T>(
  path: string,
  body?: Record<string, unknown>,
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const apiKey = requireEnv("KLAVIYO_API_KEY");
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      revision: KLAVIYO_REVISION,
      Accept: "application/json",
    },
  };
  if (body) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${KLAVIYO_API}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    let detail: string | undefined;
    try {
      detail = (JSON.parse(text) as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail;
    } catch {
      // response wasn't JSON, fall through to raw text below
    }
    throw new KlaviyoApiError(detail ?? `Klaviyo API error: HTTP ${res.status} ${text}`);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}
