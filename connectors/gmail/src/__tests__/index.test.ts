import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@omnimcp/connector-sdk-ts";

const tools = new Map<string, ToolDefinition<any>>();

vi.mock("@omnimcp/connector-sdk-ts", async () => {
  const actual = await vi.importActual<typeof import("@omnimcp/connector-sdk-ts")>("@omnimcp/connector-sdk-ts");
  return {
    ...actual,
    startConnector: vi.fn(async (definition: { tools: ReadonlyArray<ToolDefinition<any>> }) => {
      for (const tool of definition.tools) {
        tools.set(tool.name, {
          ...tool,
          async handler(input: any) {
            try {
              return await tool.handler(input);
            } catch (err) {
              return actual.errorResult(err instanceof Error ? err.message : String(err));
            }
          },
        });
      }
    }),
  };
});

vi.mock("../google-auth.js", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
}));

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0]!.text;
}

function jsonOf(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(textOf(result));
}

function mockFetchResponses(...responses: Array<{ body: unknown; ok?: boolean; status?: number }>) {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  for (const { body, ok = true, status = ok ? 200 : 400 } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, status, json: async () => body });
  }
}

beforeAll(async () => {
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_messages", () => {
  const tool = () => tools.get("list_messages")!;

  it("lists message ids matching a search query", async () => {
    mockFetchResponses({ body: { messages: [{ id: "m1", threadId: "t1" }] } });

    const result = await tool().handler({ query: "is:unread", maxResults: 10 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/messages");
    expect((url as URL).searchParams.get("q")).toBe("is:unread");
    expect((url as URL).searchParams.get("maxResults")).toBe("10");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([{ id: "m1", threadId: "t1" }]);
  });

  it("surfaces a Gmail API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid Credentials" } }, ok: false });

    const result = await tool().handler({ maxResults: 10 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid Credentials");
  });
});

describe("get_message", () => {
  const tool = () => tools.get("get_message")!;

  it("extracts subject, sender, date, snippet, and plain-text body", async () => {
    mockFetchResponses({
      body: {
        snippet: "Hello there",
        payload: {
          headers: [
            { name: "Subject", value: "Hi" },
            { name: "From", value: "a@b.com" },
            { name: "Date", value: "Mon, 1 Jan 2026 00:00:00 +0000" },
          ],
          mimeType: "text/plain",
          body: { data: Buffer.from("Hello there").toString("base64url") },
        },
      },
    });

    const result = await tool().handler({ messageId: "m1" });

    expect(jsonOf(result)).toEqual({
      subject: "Hi",
      from: "a@b.com",
      date: "Mon, 1 Jan 2026 00:00:00 +0000",
      snippet: "Hello there",
      body: "Hello there",
    });
  });
});

describe("send_message", () => {
  const tool = () => tools.get("send_message")!;

  it("sends an email, base64url-encoding the raw MIME message", async () => {
    mockFetchResponses({ body: { id: "sent-1" } });

    const result = await tool().handler({ to: "a@b.com", subject: "Hi", body: "Hello there" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/messages/send");
    expect(init.method).toBe("POST");
    const { raw } = JSON.parse(init.body);
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    expect(decoded).toContain("To: a@b.com");
    expect(decoded).toContain("Subject: Hi");
    expect(decoded).toContain("Hello there");
    expect(textOf(result)).toContain("sent-1");
  });

  it("surfaces a Gmail API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Recipient address required" } }, ok: false });

    const result = await tool().handler({ to: "", subject: "Hi", body: "Hello there" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Recipient address required");
  });
});
