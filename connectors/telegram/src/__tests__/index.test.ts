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
  process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("get_me", () => {
  const tool = () => tools.get("get_me")!;

  it("gets basic information about the bot", async () => {
    mockFetchResponses({ body: { ok: true, result: { id: 1, username: "omnimcp_bot" } } });

    const result = await tool().handler({});

    const [url] = (fetch as any).mock.calls[0];
    expect(url).toContain("/bot123:test-token/getMe");
    expect(jsonOf(result)).toEqual({ id: 1, username: "omnimcp_bot" });
  });

  it("surfaces a Telegram API error as an error result", async () => {
    mockFetchResponses({ body: { ok: false, description: "Unauthorized" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unauthorized");
  });
});

describe("get_chat", () => {
  const tool = () => tools.get("get_chat")!;

  it("gets information about a chat", async () => {
    mockFetchResponses({ body: { ok: true, result: { id: -100, title: "My Group" } } });

    const result = await tool().handler({ chatId: "-100" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ chat_id: "-100" });
    expect(jsonOf(result)).toEqual({ id: -100, title: "My Group" });
  });
});

describe("get_updates", () => {
  const tool = () => tools.get("get_updates")!;

  it("fetches recent updates with the given limit", async () => {
    mockFetchResponses({ body: { ok: true, result: [{ update_id: 1 }] } });

    const result = await tool().handler({ limit: 20 });

    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ limit: 20 });
    expect(jsonOf(result)).toEqual([{ update_id: 1 }]);
  });
});

describe("send_message", () => {
  const tool = () => tools.get("send_message")!;

  it("sends a text message to a chat", async () => {
    mockFetchResponses({ body: { ok: true, result: { message_id: 42 } } });

    const result = await tool().handler({ chatId: "123", text: "Hello" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toContain("/sendMessage");
    expect(JSON.parse(init.body)).toEqual({ chat_id: "123", text: "Hello" });
    expect(jsonOf(result)).toEqual({ messageId: 42 });
  });
});

describe("send_video", () => {
  const tool = () => tools.get("send_video")!;

  it("sends a video fetched by Telegram from a URL", async () => {
    mockFetchResponses({ body: { ok: true, result: { message_id: 43 } } });

    const result = await tool().handler({ chatId: "123", videoUrl: "https://example.com/v.mp4", caption: "Nice" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toContain("/sendVideo");
    expect(JSON.parse(init.body)).toEqual({ chat_id: "123", video: "https://example.com/v.mp4", caption: "Nice" });
    expect(jsonOf(result)).toEqual({ messageId: 43 });
  });

  it("uploads raw bytes as multipart when contentBase64 is given", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { message_id: 44 } }) });

    const result = await tool().handler({ chatId: "123", contentBase64: Buffer.from("video-bytes").toString("base64") });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toContain("/sendVideo");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("chat_id")).toBe("123");
    expect(jsonOf(result)).toEqual({ messageId: 44 });
  });
});
