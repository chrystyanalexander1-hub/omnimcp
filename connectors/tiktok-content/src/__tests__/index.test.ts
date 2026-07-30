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
  process.env.TIKTOK_CONTENT_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("get_creator_info", () => {
  const tool = () => tools.get("get_creator_info")!;

  it("gets the creator's posting eligibility and options", async () => {
    mockFetchResponses({ body: { data: { creator_username: "ada" }, error: { code: "ok", message: "", log_id: "1" } } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/post/publish/creator_info/query/");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(jsonOf(result)).toEqual({ creator_username: "ada" });
  });

  it("surfaces a TikTok API error as an error result", async () => {
    mockFetchResponses({ body: { data: {}, error: { code: "access_token_invalid", message: "Access token invalid", log_id: "1" } } });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Access token invalid");
  });
});

describe("publish_video_from_url", () => {
  const tool = () => tools.get("publish_video_from_url")!;

  it("publishes a video fetched from a public URL", async () => {
    mockFetchResponses({ body: { data: { publish_id: "p1" }, error: { code: "ok", message: "", log_id: "1" } } });

    const result = await tool().handler({ videoUrl: "https://example.com/v.mp4", title: "My video", privacyLevel: "SELF_ONLY" });

    const [, init] = (fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.post_info).toEqual({ title: "My video", privacy_level: "SELF_ONLY" });
    expect(body.source_info).toEqual({ source: "PULL_FROM_URL", video_url: "https://example.com/v.mp4" });
    expect(jsonOf(result)).toEqual({ publishId: "p1" });
  });
});

describe("get_publish_status", () => {
  const tool = () => tools.get("get_publish_status")!;

  it("checks the status of a previously submitted video", async () => {
    mockFetchResponses({ body: { data: { status: "PUBLISH_COMPLETE" }, error: { code: "ok", message: "", log_id: "1" } } });

    const result = await tool().handler({ publishId: "p1" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ publish_id: "p1" });
    expect(jsonOf(result)).toEqual({ status: "PUBLISH_COMPLETE" });
  });
});
