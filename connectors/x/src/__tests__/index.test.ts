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
  process.env.X_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("get_me", () => {
  const tool = () => tools.get("get_me")!;

  it("gets the authenticated account's profile", async () => {
    mockFetchResponses({ body: { data: { id: "1", username: "omnimcp" } } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/users/me");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(jsonOf(result)).toEqual({ id: "1", username: "omnimcp" });
  });

  it("surfaces an X API error as an error result", async () => {
    mockFetchResponses({ body: { title: "Unauthorized" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unauthorized");
  });
});

describe("create_tweet", () => {
  const tool = () => tools.get("create_tweet")!;

  it("publishes a new post", async () => {
    mockFetchResponses({ body: { data: { id: "t1" } } });

    const result = await tool().handler({ text: "Hello world" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/tweets");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ text: "Hello world" });
    expect(jsonOf(result)).toEqual({ tweetId: "t1" });
  });
});

describe("delete_tweet", () => {
  const tool = () => tools.get("delete_tweet")!;

  it("deletes a post", async () => {
    mockFetchResponses({ body: { data: { deleted: true } } });

    const result = await tool().handler({ tweetId: "t1" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/tweets/t1");
    expect(init.method).toBe("DELETE");
    expect(jsonOf(result)).toEqual({ deleted: true });
  });
});
