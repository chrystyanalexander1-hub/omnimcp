import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_BASE = "https://slack.com/api";

export class SlackApiError extends Error {}

async function slackRequest<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = requireEnv("SLACK_BOT_TOKEN");
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!res.ok || !json.ok) {
    throw new SlackApiError(json.error ?? `Slack API error: HTTP ${res.status}`);
  }
  return json;
}

export async function listChannels(): Promise<unknown[]> {
  const result = await slackRequest<{ channels: unknown[] }>("conversations.list");
  return result.channels;
}

export async function sendMessage(channel: string, text: string): Promise<{ ts: string; channel: string }> {
  return slackRequest("chat.postMessage", { channel, text });
}

/**
 * Slack sunset the old single-call `files.upload` endpoint in favor of a three-step
 * flow: reserve an upload URL, PUT the bytes there directly, then tell Slack the
 * upload is done and which channel it belongs to.
 */
export async function uploadFile(channel: string, filename: string, contentBase64: string, title?: string): Promise<unknown[]> {
  const token = requireEnv("SLACK_BOT_TOKEN");
  const bytes = Buffer.from(contentBase64, "base64");

  const urlRes = await fetch(`${API_BASE}/files.getUploadURLExternal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ filename, length: String(bytes.length) }),
  });
  const urlJson = (await urlRes.json()) as { ok: boolean; error?: string; upload_url: string; file_id: string };
  if (!urlRes.ok || !urlJson.ok) {
    throw new SlackApiError(urlJson.error ?? `Slack API error: HTTP ${urlRes.status}`);
  }

  const form = new FormData();
  form.set("file", new Blob([bytes]), filename);
  const uploadRes = await fetch(urlJson.upload_url, { method: "POST", body: form });
  if (!uploadRes.ok) {
    throw new SlackApiError(`Slack file upload failed: HTTP ${uploadRes.status}`);
  }

  const complete = await slackRequest<{ files: unknown[] }>("files.completeUploadExternal", {
    files: [{ id: urlJson.file_id, ...(title ? { title } : {}) }],
    channel_id: channel,
  });
  return complete.files;
}
