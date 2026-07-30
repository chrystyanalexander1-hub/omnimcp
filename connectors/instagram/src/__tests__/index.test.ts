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
  process.env.INSTAGRAM_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_media", () => {
  const tool = () => tools.get("list_media")!;

  it("lists published media for a business account", async () => {
    mockFetchResponses({ body: { data: [{ id: "m1", media_type: "IMAGE" }] } });

    const result = await tool().handler({ igUserId: "ig1" });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/ig1/media");
    expect((url as URL).searchParams.get("access_token")).toBe("test-token");
    expect(jsonOf(result)).toEqual([{ id: "m1", media_type: "IMAGE" }]);
  });

  it("surfaces an Instagram API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid OAuth access token" } }, ok: false });

    const result = await tool().handler({ igUserId: "ig1" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid OAuth access token");
  });
});

describe("create_media_container", () => {
  const tool = () => tools.get("create_media_container")!;

  it("creates a container from an image URL", async () => {
    mockFetchResponses({ body: { id: "container-1" } });

    const result = await tool().handler({ igUserId: "ig1", imageUrl: "https://example.com/i.jpg", caption: "Nice" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/ig1/media");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("image_url")).toBe("https://example.com/i.jpg");
    expect(body.get("caption")).toBe("Nice");
    expect(jsonOf(result)).toEqual({ creationId: "container-1" });
  });

  it("marks a video container as REELS media type", async () => {
    mockFetchResponses({ body: { id: "container-2" } });

    await tool().handler({ igUserId: "ig1", videoUrl: "https://example.com/v.mp4" });

    const [, init] = (fetch as any).mock.calls[0];
    expect((init.body as URLSearchParams).get("media_type")).toBe("REELS");
  });
});

describe("publish_media", () => {
  const tool = () => tools.get("publish_media")!;

  it("publishes a previously created media container", async () => {
    mockFetchResponses({ body: { id: "media-1" } });

    const result = await tool().handler({ igUserId: "ig1", creationId: "container-1" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/ig1/media_publish");
    expect((init.body as URLSearchParams).get("creation_id")).toBe("container-1");
    expect(jsonOf(result)).toEqual({ mediaId: "media-1" });
  });
});
