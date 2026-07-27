import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://api.linkedin.com/v2";

export class LinkedInApiError extends Error {}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireEnv("LINKEDIN_ACCESS_TOKEN")}`,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

interface Profile {
  readonly id: string;
  readonly localizedFirstName?: string;
  readonly localizedLastName?: string;
}

export async function getProfile(): Promise<Profile> {
  const res = await fetch(`${API_BASE}/me`, { headers: authHeaders() });
  const json = (await res.json()) as { message?: string } & Profile;
  if (!res.ok) throw new LinkedInApiError(json.message ?? `LinkedIn API error: HTTP ${res.status}`);
  return json;
}

export async function createPost(text: string, visibility: "PUBLIC" | "CONNECTIONS"): Promise<{ postId: string | null }> {
  const profile = await getProfile();
  const authorUrn = `urn:li:person:${profile.id}`;

  const res = await fetch(`${API_BASE}/ugcPosts`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
    }),
  });

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new LinkedInApiError(json?.message ?? `LinkedIn API error: HTTP ${res.status}`);
  }
  return { postId: res.headers.get("x-restli-id") };
}
