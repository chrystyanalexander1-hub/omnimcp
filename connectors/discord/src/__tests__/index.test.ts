import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@omnimcp/connector-sdk-ts";

const tools = new Map<string, ToolDefinition<any>>();

vi.mock("@omnimcp/connector-sdk-ts", async () => {
  const actual = await vi.importActual<typeof import("@omnimcp/connector-sdk-ts")>("@omnimcp/connector-sdk-ts");
  return {
    ...actual,
    startConnector: vi.fn(async (definition: { tools: ReadonlyArray<ToolDefinition<any>> }) => {
      // Wraps each handler the same way the real startConnector does, so a thrown
      // error surfaces as an errorResult here too instead of failing the test.
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
  process.env.DISCORD_BOT_TOKEN = "test-bot-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_guild_channels", () => {
  const tool = () => tools.get("list_guild_channels")!;

  it("lists channels in a guild", async () => {
    mockFetchResponses({ body: [{ id: "c1", name: "general" }] });

    const result = await tool().handler({ guildId: "g1" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/guilds/g1/channels");
    expect(init.headers.Authorization).toBe("Bot test-bot-token");
    expect(jsonOf(result)).toEqual([{ id: "c1", name: "general" }]);
  });

  it("surfaces a Discord API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Unknown Guild" }, ok: false });

    const result = await tool().handler({ guildId: "missing" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unknown Guild");
  });
});

describe("get_channel_messages", () => {
  const tool = () => tools.get("get_channel_messages")!;

  it("fetches recent messages with the requested limit", async () => {
    mockFetchResponses({ body: [{ id: "m1", content: "hi" }] });

    const result = await tool().handler({ channelId: "c1", limit: 10 });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/channels/c1/messages?limit=10");
    expect(jsonOf(result)).toEqual([{ id: "m1", content: "hi" }]);
  });
});

describe("send_message", () => {
  const tool = () => tools.get("send_message")!;

  it("sends a text message to a channel", async () => {
    mockFetchResponses({ body: { id: "m2" } });

    const result = await tool().handler({ channelId: "c1", content: "Hello" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/channels/c1/messages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ content: "Hello" });
    expect(jsonOf(result)).toEqual({ messageId: "m2" });
  });

  it("surfaces a Discord API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Missing Permissions" }, ok: false });

    const result = await tool().handler({ channelId: "c1", content: "Hello" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Missing Permissions");
  });
});
