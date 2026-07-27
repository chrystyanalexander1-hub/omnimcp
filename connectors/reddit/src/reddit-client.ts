import { getAccessToken, REDDIT_USER_AGENT } from "./reddit-auth.js";

const REDDIT_API = "https://oauth.reddit.com";

export class RedditApiError extends Error {}

export async function redditGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${REDDIT_API}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "User-Agent": REDDIT_USER_AGENT } });
  if (!res.ok) {
    throw new RedditApiError(`Reddit API error: HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Reddit's write endpoints (submit, comment) take form-urlencoded params, not JSON, and wrap the response as `{ json: { errors, data } }`. */
export async function redditPostForm<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${REDDIT_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": REDDIT_USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ api_type: "json", ...(params as Record<string, string>) }),
  });

  if (!res.ok) {
    throw new RedditApiError(`Reddit API error: HTTP ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { json: { errors: unknown[][]; data: T } };
  if (json.json.errors.length > 0) {
    throw new RedditApiError(json.json.errors.map((e) => e.join(" ")).join("; "));
  }
  return json.json.data;
}
