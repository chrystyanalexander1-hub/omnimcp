import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./google-auth.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailApiError extends Error {}

const listMessagesSchema = z.object({ query: z.string().optional(), maxResults: z.number().default(10) });
const getMessageSchema = z.object({ messageId: z.string() });
const sendMessageSchema = z.object({ to: z.string(), subject: z.string(), body: z.string() });

interface GmailPart {
  readonly mimeType?: string;
  readonly body?: { readonly data?: string };
  readonly parts?: readonly GmailPart[];
}

function extractPlainText(payload: GmailPart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  for (const part of payload.parts ?? []) {
    const text = extractPlainText(part);
    if (text) return text;
  }
  return "";
}

function headerValue(headers: ReadonlyArray<{ name: string; value: string }>, name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new GmailApiError(json.error?.message ?? `Gmail API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "gmail",
  version: "0.1.0",
  tools: [
    {
      name: "list_messages",
      description: "List message IDs matching a Gmail search query.",
      inputSchema: listMessagesSchema,
      async handler({ query, maxResults }) {
        const token = await getAccessToken();
        const url = new URL(`${GMAIL_API}/messages`);
        url.searchParams.set("maxResults", String(maxResults));
        if (query) url.searchParams.set("q", query);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const { messages } = await handle<{ messages?: Array<{ id: string; threadId: string }> }>(res);
        return jsonResult(messages ?? []);
      },
    },
    {
      name: "get_message",
      description: "Get a message's subject, sender, date, and plain-text body.",
      inputSchema: getMessageSchema,
      async handler({ messageId }) {
        const token = await getAccessToken();
        const url = new URL(`${GMAIL_API}/messages/${encodeURIComponent(messageId)}`);
        url.searchParams.set("format", "full");
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const message = await handle<{ snippet: string; payload: { headers: Array<{ name: string; value: string }> } & GmailPart }>(res);
        const headers = message.payload.headers ?? [];
        return jsonResult({
          subject: headerValue(headers, "Subject"),
          from: headerValue(headers, "From"),
          date: headerValue(headers, "Date"),
          snippet: message.snippet,
          body: extractPlainText(message.payload),
        });
      },
    },
    {
      name: "send_message",
      description: "Send an email from the authenticated account.",
      inputSchema: sendMessageSchema,
      async handler({ to, subject, body }) {
        const token = await getAccessToken();
        const raw = Buffer.from(
          [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\r\n"),
          "utf-8",
        ).toString("base64url");
        const res = await fetch(`${GMAIL_API}/messages/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        });
        const { id } = await handle<{ id: string }>(res);
        return textResult(`Message sent (id: ${id})`);
      },
    },
  ],
});
