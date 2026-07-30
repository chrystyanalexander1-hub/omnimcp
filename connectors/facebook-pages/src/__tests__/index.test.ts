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
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "test-page-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_pages", () => {
  const tool = () => tools.get("list_pages")!;

  it("lists pages the token can manage", async () => {
    mockFetchResponses({ body: { data: [{ id: "p1", name: "My Page" }] } });

    const result = await tool().handler({});

    const [url] = (fetch as any).mock.calls[0];
    expect((url as URL).searchParams.get("access_token")).toBe("test-page-token");
    expect(jsonOf(result)).toEqual([{ id: "p1", name: "My Page" }]);
  });

  it("surfaces a Facebook API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid OAuth access token" } }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid OAuth access token");
  });
});

describe("get_page_insights", () => {
  const tool = () => tools.get("get_page_insights")!;

  it("gets insight metrics for a page", async () => {
    mockFetchResponses({ body: { data: [{ name: "page_impressions", values: [{ value: 100 }] }] } });

    const result = await tool().handler({ pageId: "p1", metric: "page_impressions" });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/p1/insights");
    expect((url as URL).searchParams.get("metric")).toBe("page_impressions");
    expect(jsonOf(result)).toEqual([{ name: "page_impressions", values: [{ value: 100 }] }]);
  });
});

describe("create_post", () => {
  const tool = () => tools.get("create_post")!;

  it("publishes a text post to a page's feed", async () => {
    mockFetchResponses({ body: { id: "post-1" } });

    const result = await tool().handler({ pageId: "p1", message: "Hello world" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/p1/feed");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("message")).toBe("Hello world");
    expect(body.get("access_token")).toBe("test-page-token");
    expect(jsonOf(result)).toEqual({ postId: "post-1" });
  });
});

describe("upload_video", () => {
  const tool = () => tools.get("upload_video")!;

  it("publishes a video fetched from a URL", async () => {
    mockFetchResponses({ body: { id: "video-1" } });

    const result = await tool().handler({ pageId: "p1", videoUrl: "https://example.com/v.mp4", description: "Nice" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/p1/videos");
    expect((init.body as URLSearchParams).get("file_url")).toBe("https://example.com/v.mp4");
    expect(jsonOf(result)).toEqual({ videoId: "video-1" });
  });
});

describe("upload_photo", () => {
  const tool = () => tools.get("upload_photo")!;

  it("publishes a photo fetched from a URL", async () => {
    mockFetchResponses({ body: { id: "photo-1", post_id: "post-2" } });

    const result = await tool().handler({ pageId: "p1", imageUrl: "https://example.com/i.jpg", caption: "Nice shot" });

    const [, init] = (fetch as any).mock.calls[0];
    expect((init.body as URLSearchParams).get("url")).toBe("https://example.com/i.jpg");
    expect(jsonOf(result)).toEqual({ photoId: "photo-1", postId: "post-2" });
  });

  it("surfaces a Facebook API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Unsupported photo file type" } }, ok: false });

    const result = await tool().handler({ pageId: "p1", imageUrl: "https://example.com/i.bmp" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unsupported photo file type");
  });
});
